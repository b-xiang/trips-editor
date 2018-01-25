import { DOMSource, h, VNode } from '@cycle/dom'
import isolate from '@cycle/isolate'
import * as d3 from 'd3'
import { is } from 'immutable'
import xs, { Stream } from 'xstream'
import { Action, initState } from './actions'
import Inspector from './components/Inspector'
import StatusBar from './components/StatusBar'
import Svg from './components/Svg'
import commonInteraction from './interaction/commonInteraction'
import dragItems from './interaction/dragItems'
import drawLine from './interaction/drawLine'
import drawPolygon from './interaction/drawPolygon'
import drawRect from './interaction/drawRect'
import editPoints from './interaction/editPoints'
import resizeItems from './interaction/resizeItems'
import zoom from './interaction/zoom'
import { AdjustConfig, InteractionFn, Updater } from './interfaces'
import { KeyboardSource } from './makeKeyboardDriver'
import './styles/app.styl'
import AdjustedMouse from './utils/AdjustedMouse'
import makeAdjuster from './utils/makeAdjuster'
import Selection, { selectionRecord } from './utils/Selection'

const EmptyComponent = (sources: { DOM: DOMSource }) => ({ DOM: xs.of(null) as any })
const Menubar = EmptyComponent
const Structure = EmptyComponent

export interface Sources {
  DOM: DOMSource
  keyboard: KeyboardSource
  mouseup: Stream<MouseEvent>
  mousemove: Stream<MouseEvent>
}
export interface Sinks {
  DOM: Stream<VNode>
  title: Stream<string>
}

const initMode = 'idle'

export default function App(sources: Sources): Sinks {
  const domSource = sources.DOM
  const keyboard = sources.keyboard

  const actionProxy$ = xs.create<Action>()
  const nextModeProxy$ = xs.create<string>()
  const changeSelectionProxy$ = xs.create<Updater<Selection>>()
  const nextResizerProxy$ = xs.create<string>()
  const nextVertexIndexProxy$ = xs.create<number>()
  const nextVertexInsertIndexProxy$ = xs.create<number>()
  const nextTransformProxy$ = xs.create<d3.ZoomTransform>()
  const nextAdjustConfigs$ = xs.create<AdjustConfig[]>()

  const state$ = actionProxy$.fold((s, updater) => updater(s), initState)
  const transform$ = nextTransformProxy$.startWith(d3.zoomIdentity)
  const mode$ = nextModeProxy$.startWith(initMode)
  const selection$ = changeSelectionProxy$.fold((sel, updater) => updater(sel), selectionRecord)
  const adjustConfigs$ = nextAdjustConfigs$.startWith([])

  const mouse = new AdjustedMouse(
    transform$,
    sources.mousemove,
    sources.mouseup,
    nextResizerProxy$,
    nextVertexIndexProxy$,
    nextVertexInsertIndexProxy$,
  )

  const interactions: InteractionFn[] = [
    commonInteraction,
    dragItems,
    resizeItems,
    zoom,
    drawRect,
    drawPolygon,
    drawLine,
    editPoints,
  ]
  const sinksArray = interactions.map(fn =>
    fn({
      mode: mode$,
      mouse,
      keyboard,
      state: state$,
      selection: selection$,
      transform: transform$,
    }),
  )
  const addons = Object.assign({}, ...sinksArray.map(sinks => sinks.addons))

  // 目前正在绘制的元素 用于绘制预览
  const drawingItem$ = xs.merge(...sinksArray.map(sinks => sinks.drawingItem).filter(Boolean))

  // views
  const menubar = isolate(Menubar, 'menubar')({ DOM: domSource })
  const structure = isolate(Structure, 'structure')({ DOM: domSource })
  const svg = isolate(Svg, 'svg')({
    DOM: domSource,
    mouse,
    keyboard,
    drawingItem: drawingItem$,
    state: state$,
    selection: selection$,
    transform: transform$,
    adjustConfigs: adjustConfigs$,
    addons,
  })
  const inspector = isolate(Inspector, 'inspector')({
    DOM: domSource,
    selection: selection$,
    state: state$,
  })
  const statusBar = isolate(StatusBar, 'status-bar')({
    DOM: domSource,
    state: state$,
    mode: mode$,
  })

  actionProxy$.imitate(
    xs.merge(inspector.action, ...sinksArray.map(sinks => sinks.action).filter(Boolean)),
  )
  nextModeProxy$.imitate(xs.merge(...sinksArray.map(sinks => sinks.nextMode).filter(Boolean)))
  nextTransformProxy$.imitate(
    xs.merge(...sinksArray.map(sinks => sinks.nextTransform).filter(Boolean)),
  )
  changeSelectionProxy$.imitate(
    xs.merge(...sinksArray.map(sinks => sinks.changeSelection).filter(Boolean)),
  )
  nextAdjustConfigs$.imitate(
    xs.merge(...sinksArray.map(sinks => sinks.nextAdjustConfigs).filter(Boolean)),
  )

  mouse.imitate(svg.rawDown, svg.rawClick, svg.rawDblclick, svg.rawWheel)
  mouse.setAdjuster(makeAdjuster(keyboard, mouse, state$, transform$, adjustConfigs$))

  nextResizerProxy$.imitate(svg.nextResizer)
  nextVertexIndexProxy$.imitate(
    xs.merge(
      svg.nextVertexIndex,
      ...sinksArray.map(sinks => sinks.nextVertexIndex).filter(Boolean),
    ),
  )
  nextVertexInsertIndexProxy$.imitate(svg.nextVertexInsertIndex)

  const vdom$ = xs
    .combine(menubar.DOM, structure.DOM, svg.DOM, inspector.DOM, statusBar.DOM)
    .map(components => h('div.app', components.filter(Boolean)))

  return {
    DOM: vdom$,
    title: xs.never(),
  }
}
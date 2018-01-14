import { DOMSource, h } from '@cycle/dom'
import isolate from '@cycle/isolate'
import * as R from 'ramda'
import { VNode } from 'snabbdom/vnode'
import xs, { Stream } from 'xstream'
import actions, { Action, initState } from './actions'
import Inspector from './components/Inspector'
import Svg from './components/Svg'
import StatusBar from './components/StatusBar'
import doDragItems from './interaction/dragItems'
import doDrawLine from './interaction/drawLine'
import doDrawRect from './interaction/drawRect'
import doResizeItems from './interaction/resizeItems'
import doZoom from './interaction/zoom'
import { Mouse } from './interfaces'
import { ShortcutSource } from './makeShortcutDriver'
import './styles/app.styl'
import { invertPos } from './utils/common'

const EmptyComponent = (sources: { DOM: DOMSource }) => ({ DOM: xs.of(null) as any })
const Menubar = EmptyComponent
const Structure = EmptyComponent

export interface Sources {
  DOM: DOMSource
  shortcut: ShortcutSource
  mouseup: Stream<MouseEvent>
  mousemove: Stream<MouseEvent>
}
export interface Sinks {
  DOM: Stream<VNode>
}

const initMode = 'idle'

export default function App(sources: Sources): Sinks {
  const domSource = sources.DOM
  const shortcut = sources.shortcut
  const actionProxy$ = xs.create<Action>()
  const changeModeProxy$ = xs.create<string>()
  const nextResizerProxy$ = xs.create<string>()
  const resizer$ = nextResizerProxy$.startWith(null)

  const state$ = actionProxy$.fold((s, updater) => updater(s), initState)
  const transform$ = state$.map(R.prop('transform'))

  // 当前选中的元素集合
  const selection$ = state$.map(s => s.items.filter(item => s.sids.has(item.id)))
  // 当前选中元素集合在画板中的MBR
  // const selectionBBox$ = selection$.map(sel =>
  //   getBoundingBoxOfPoints(sel.toList().flatMap(item => item.getPoints())),
  // )

  const mouse: Mouse = {
    down$: xs.create(),
    rawDown$: xs.create(),
    move$: invertPos(sources.mousemove, transform$),
    rawMove$: sources.mousemove,
    up$: invertPos(sources.mouseup, transform$),
    rawUp$: sources.mouseup,
    dblclick$: xs.create(),
    rawDblclick$: xs.create(),
    wheel$: xs.empty(),
    rawWheel$: xs.empty(),
  }

  const esc$ = sources.shortcut.shortcut('esc', 'idle')
  const mode$ = changeModeProxy$.startWith(initMode)

  const changeSidsAction$ = mouse.down$
    .peekFilter(mode$, R.identical('idle'))
    .peekFilter(resizer$, R.identical(null))
    .sampleCombine(state$)
    .map(([pos, state]) => {
      const clickedItems = state.items.filter(item => item.containsPoint(pos))
      const targetItemId = state.zlist.findLast(itemId => clickedItems.has(itemId))
      // const canMoveItem = !clickedItems.isEmpty() && !state.items.get(targetItemId).locked
      if (targetItemId != null) {
        return actions.updateSids([targetItemId])
      } else {
        return actions.clearSids()
      }
    })

  const dragItems = doDragItems(mouse, mode$, state$, resizer$)
  const resizeItems = doResizeItems(mouse, mode$, selection$, resizer$)
  const zoom = doZoom(mouse, mode$, state$, resizer$)
  const drawRect = doDrawRect(mouse, mode$, shortcut)
  const drawLine = doDrawLine(mouse, mode$, shortcut)

  // 目前正在绘制的元素 用于绘制预览
  const drawingItem$ = xs.merge(drawRect.drawingItem$, drawLine.drawingItem$).startWith(null)

  // views
  const menubar = (isolate(Menubar, 'menubar') as typeof Menubar)({ DOM: domSource })
  const structure = (isolate(Structure, 'structure') as typeof Structure)({ DOM: domSource })
  const svg = (isolate(Svg, 'svg') as typeof Svg)({
    DOM: domSource,
    drawingItem: drawingItem$,
    state: state$,
  })
  const inspector = (isolate(Inspector, 'inspector') as typeof Inspector)({
    DOM: domSource,
    selection: selection$,
    state: state$,
  })

  const statusBar = (isolate(StatusBar, 'status-bar') as typeof StatusBar)({
    DOM: domSource,
    state: state$,
    mode: mode$,
  })

  changeModeProxy$.imitate(xs.merge(esc$, drawRect.changeMode$, drawLine.changeMode$))
  nextResizerProxy$.imitate(svg.resizer)
  mouse.rawDown$.imitate(svg.rawDown)
  mouse.down$.imitate(invertPos(svg.rawDown, transform$))
  mouse.rawDblclick$.imitate(svg.rawDblclick)
  mouse.dblclick$.imitate(invertPos(svg.rawDblclick, transform$))
  mouse.rawWheel$.imitate(svg.rawWheel)
  mouse.wheel$.imitate(
    svg.rawWheel.sampleCombine(transform$).map(([{ deltaY, pos }, transform]) => ({
      deltaY,
      pos: {
        x: transform.invertX(pos.x),
        y: transform.invertY(pos.y),
      },
    })),
  )

  actionProxy$.imitate(
    xs.merge(
      changeSidsAction$,
      dragItems,
      // interactions
      drawRect.action$,
      drawLine.action$,
      inspector.actions,
      zoom.action$,
      resizeItems.action$,
    ),
  )

  const vdom$ = xs
    .combine(menubar.DOM, structure.DOM, svg.DOM, inspector.DOM, statusBar.DOM)
    .map(components => h('div.app', components.filter(R.identity)))

  return { DOM: vdom$ }
}

import { identical } from 'ramda'
import xs from 'xstream'
import { AdjustConfig, InteractionFn, PolylineItem, Sel, State } from '../interfaces'

const drawLine: InteractionFn = ({ mouse, UI, mode: mode$, keyboard }) => {
  const toLineReadyMode$ = xs.merge(UI.intent('line'), keyboard.shortcut('l')).mapTo('line.ready')

  const startPos$ = mouse.adown$.when(mode$, identical('line.ready')).remember()
  const toLineDrawingMode$ = startPos$.mapTo('line.drawing')

  const movingPos$ = startPos$
    .map(start => mouse.amove$.when(mode$, identical('line.drawing')).startWith(start))
    .flatten()

  const drawingLine$ = mode$
    .checkedFlatMap(identical('line.drawing'), () =>
      xs.combine(startPos$, movingPos$).map(PolylineItem.lineFromPoints),
    )
    .filter(Boolean)

  const newItem$ = mouse.aup$.when(mode$, identical('line.drawing')).peek(drawingLine$)
  const toIdleMode$ = newItem$.mapTo('idle')

  const nextMode$ = xs.merge(toLineReadyMode$, toLineDrawingMode$, toIdleMode$)
  const nextAdjustConfigs$ = nextMode$.map<AdjustConfig[]>(nextMode => {
    if (nextMode === 'line.ready' || nextMode === 'line.drawing') {
      return [{ type: 'cement' }, { type: 'align' }]
    } else {
      return []
    }
  })

  return {
    drawingItem: drawingLine$,
    action: newItem$.map(State.addItem),
    nextMode: nextMode$,
    nextAdjustConfigs: nextAdjustConfigs$,
    updateSel: newItem$.mapTo(Sel.selectLast('vertices')),
  }
}

export default drawLine
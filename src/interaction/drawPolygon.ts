import { h, VNode } from '@cycle/dom'
import { List } from 'immutable'
import { always, identical } from 'ramda'
import xs, { Stream } from 'xstream'
import actions from '../actions'
import { SENSE_RANGE } from '../constants'
import { InteractionFn, Point, PolygonItem, Updater } from '../interfaces'
import { distanceBetweenPointAndPoint, injectItemId } from '../utils/common'
import { selectionUtils } from '../utils/Selection'

const drawPolygon: InteractionFn = ({
  mouse,
  mode: mode$,
  shortcut,
  transform: transform$,
}) => {
  const addPointProxy$ = xs.create<Point>()
  const resetPointsProxy$ = xs.create()

  const changePoints$: Stream<Updater<List<Point>>> = xs.merge(
    addPointProxy$.map(p => (points: List<Point>) => points.push(p)),
    resetPointsProxy$.mapTo(always(List<Point>())),
  )

  // 记录当前绘制的点
  const points$ = changePoints$.fold((points, updater) => updater(points), List<Point>())

  // 记录当前是否能够完成polygon的绘制
  const canClose$ = xs
    .combine(mouse.move$, transform$)
    .sampleCombine(points$)
    .map(
      ([[movingPos, transform], points]) =>
        points.count() >= 3 &&
        distanceBetweenPointAndPoint(points.first(), movingPos) < SENSE_RANGE / transform.k,
    )
    .dropRepeats()
    .startWith(false)

  // 绘制一个点
  const addPoint$ = mouse.click$.when(mode$, identical('polygon')).whenNot(canClose$)
  addPointProxy$.imitate(addPoint$)
  addPoint$.addListener({})

  // 闭合多边形，完成绘制
  const close$ = mouse.click$.when(canClose$)

  const newItem$ = close$
    .peek(points$)
    .map(PolygonItem.fromPoints)
    .map(injectItemId)

  const addItem$ = newItem$.map(actions.addItem)
  resetPointsProxy$.imitate(addItem$)

  // 记录当前正在绘制的多边形的预览
  const drawingPolygon$ = mode$
    .checkedFlatMap(
      identical('polygon'),
      // () => mouse.move$.sampleCombine(points$).map(PolygonItem.preview),
      () =>
        mouse.move$
          .sampleCombine(canClose$, points$)
          .map(
            ([movingPos, canClose, points]) =>
              canClose
                ? PolygonItem.preview([points.first(), points])
                : PolygonItem.preview([movingPos, points]),
          ),
    )
    .startWith(null)

  const closeIndicator$: Stream<VNode> = xs
    .combine(mode$, canClose$)
    .checkedFlatMap(
      ([mode, canClose]) => mode === 'polygon' && canClose,
      () => points$.map(points => points.first()),
    )
    .checkedFlatMap(p =>
      transform$.map(transform =>
        h('circle.close-indicator', {
          attrs: {
            cx: p.x,
            cy: p.y,
            fill: 'red',
            opacity: 0.3,
            r: SENSE_RANGE / transform.k,
          },
        }),
      ),
    )
    .startWith(null)

  return {
    drawingItem: drawingPolygon$,
    action: addItem$,
    nextMode: xs.merge(shortcut.shortcut('q').mapTo('polygon'), newItem$.mapTo('idle')),
    changeSelection: newItem$.map(selectionUtils.selectItem),
    addons: { polygonCloseIndicator: closeIndicator$ },
  }
}

export default drawPolygon

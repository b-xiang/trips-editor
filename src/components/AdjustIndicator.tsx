import { DOMSource, h, VNode } from '@cycle/dom'
import xs, { Stream } from 'xstream'
import { AppConfig } from '../interfaces'
import AdjustedMouse from '../utils/AdjustedMouse'

export interface Sources {
  DOM: DOMSource
  transform: Stream<d3.ZoomTransform>
  mouse: AdjustedMouse
  config: Stream<AppConfig>
}

export interface Sinks {
  DOM: Stream<VNode>
}

export default function AdjustIndicator(sources: Sources): Sinks {
  const vdom$ = xs
    .combine(sources.mouse.adjustedMoveInfo$, sources.transform, sources.config)
    .map(([adjustResult, transform, config]) => {
      const cement = adjustResult.applied.includes('cement')
        ? h('circle', {
            key: 'adjust-cement',
            attrs: {
              cx: adjustResult.point.x,
              cy: adjustResult.point.y,
              r: config.senseRange / transform.k,
              fill: 'red',
              opacity: 0.4,
            },
          })
        : null

      const align = adjustResult.applied.includes('align')
        ? h(
            'g.adjust-align',
            { key: 'adjust-align', style: { opacity: '0.6' } },
            [
              adjustResult.info.horizontalPoint
                ? h('line.adjust-align-horizontal', {
                    attrs: {
                      'stroke-width': 2 / transform.k,
                      'stroke-dasharray': `${4 / transform.k}`,
                      stroke: 'red',
                      x1: adjustResult.point.x,
                      y1: adjustResult.point.y,
                      x2: adjustResult.info.horizontalPoint.x,
                      y2: adjustResult.info.horizontalPoint.y,
                    },
                  })
                : null,
              adjustResult.info.verticalPoint
                ? h('line.adjust-align-vertical', {
                    attrs: {
                      'stroke-width': 2 / transform.k,
                      'stroke-dasharray': `${4 / transform.k}`,
                      stroke: 'red',
                      x1: adjustResult.point.x,
                      y1: adjustResult.point.y,
                      x2: adjustResult.info.verticalPoint.x,
                      y2: adjustResult.info.verticalPoint.y,
                    },
                  })
                : null,
            ].filter(Boolean),
          )
        : null

      return h('g.adjust-indicator', [cement, align].filter(Boolean))
    })

  return {
    DOM: vdom$,
  }
}

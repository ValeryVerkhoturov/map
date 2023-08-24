/* eslint-disable @typescript-eslint/no-unused-vars */
import React, { useRef, useState, useImperativeHandle, forwardRef, useEffect } from "react"
import * as d3 from "d3"
import { type MapData } from "~/lib/map/MapData"
import { type Graph, type Vertex } from "~/lib/map/Graph"
import { MapObjectType, type MapObject } from "~/lib/map/MapObject"

interface MapRouteProps {
  mapData: MapData
  className?: string
}

export interface MapRouteRef {
  renderRoute: (startMapObject: MapObject, endMapObject: MapObject, currentFloor: number) => void
  clearRoute: () => void
}

const MapRoute = forwardRef<MapRouteRef, MapRouteProps>((props, ref) => {
  const [shortestPath, setShortestPath] = useState<Vertex[]>([])
  const svgRef = useRef<SVGSVGElement | null>(null)

  const [mapData, setMapData] = useState<MapData>(props.mapData)

  const isPointInThisFloor = (point: Vertex, floor: number) => {
    const floorGraph = mapData.floors[floor.toString()]
    if (!floorGraph) return false

    return floorGraph.vertices.includes(point)
  }

  const getFloorByPoint = (point: Vertex) => {
    for (const floor in mapData.floors) {
      if (mapData.floors[floor]?.vertices.includes(point)) {
        return parseInt(floor)
      }
    }

    return 0
  }

  useImperativeHandle(ref, () => ({
    renderRoute: (startMapObject, endMapObject, currentFloor) => {
      const path = mapData.getShortestPath(startMapObject, endMapObject)
      if (!path || path.length === 1) return

      if (!svgRef.current) return

      const svg = d3.select(svgRef.current)

      // Очистить предыдущие маршруты и точки
      svg.selectAll(".route").remove()
      svg.selectAll(".circle-point").remove()

      const currentFloorPath = path.filter((point) => isPointInThisFloor(point, currentFloor))

      // Список сегментов пути, разделенных лестницами
      const pathsByStairs = [] as Vertex[][]

      if (currentFloorPath.length === 0) return

      // Первый сегмент пути всегда начинается с начальной точки
      pathsByStairs.push([currentFloorPath[0] as Vertex])

      for (let i = 1; i < currentFloorPath.length; i++) {
        const vert = currentFloorPath[i] as Vertex
        const prevVert = currentFloorPath[i - 1] as Vertex

        if (!vert.mapObjectId && !prevVert.mapObjectId) {
          ;(pathsByStairs[pathsByStairs.length - 1] as Vertex[]).push(vert)
          continue
        }

        const mapObj = mapData.getMapObjectById(vert.mapObjectId as string)
        const prevMapObj = mapData.getMapObjectById(prevVert.mapObjectId as string)

        if (mapObj && prevMapObj) {
          if (mapObj.type === MapObjectType.STAIRS && prevMapObj.type === MapObjectType.STAIRS) {
            // Если оба объекта лестницы, то добавить новый сегмент пути
            pathsByStairs.push([vert])
          } else if (mapObj.type === MapObjectType.STAIRS && prevMapObj.type !== MapObjectType.STAIRS) {
            // Если текущий объект лестница, а предыдущий нет, то добавить текущий объект в последний сегмент пути
            ;(pathsByStairs[pathsByStairs.length - 1] as Vertex[]).push(vert)
          } else if (mapObj.type !== MapObjectType.STAIRS && prevMapObj.type === MapObjectType.STAIRS) {
            // Если текущий объект не лестница, а предыдущий объект лестница, то добавить текущий объект в новый сегмент пути
            pathsByStairs.push([vert])
          } else if (mapObj.type !== MapObjectType.STAIRS && prevMapObj.type !== MapObjectType.STAIRS) {
            // Если оба объекта не лестницы, то добавить текущий объект в последний сегмент пути
            ;(pathsByStairs[pathsByStairs.length - 1] as Vertex[]).push(vert)
          }
        } else {
          ;(pathsByStairs[pathsByStairs.length - 1] as Vertex[]).push(vert)
        }
      }

      for (const floorPath of pathsByStairs) {
        const lineFunction = d3
          .line<Vertex>()
          .x((d) => d.x)
          .y((d) => d.y)
          .curve(d3.curveLinear)

        const line = svg
          .append("path")
          .attr("class", "route")
          .attr("d", lineFunction(floorPath))
          .attr("stroke", "#e74694")
          .attr("stroke-width", 6)
          .attr("fill", "none")
          .attr("stroke-dasharray", "0,0") // чтобы не было видно линии при первом рендере

        line
          .transition()
          .duration(1000)
          .ease(d3.easeLinear)
          .attrTween("stroke-dasharray", function (this) {
            const len = this.getTotalLength()
            return function (t) {
              return `${len * t}, ${len * (1 - t)}`
            }
          })

        const drawCirclePoint = (point: Vertex, text: string) => {
          const circlePoints = svg
            .append("g")
            .attr("class", "circle-point")
            .selectAll(".circle-point")
            .data([point])
            .enter()

          circlePoints
            .append("circle")
            .attr("cx", (d) => d.x)
            .attr("cy", (d) => d.y)
            .attr("r", 18)
            .attr("fill", "#e74694")

          circlePoints
            .append("text")
            .attr("x", (d) => d.x)
            .attr("y", (d) => d.y)
            .attr("fill", "#fff")
            .attr("text-anchor", "middle")
            .attr("dominant-baseline", "middle")
            .attr("font-size", "18px")
            .attr("font-weight", "bold")
            .text(text)
        }

        const startPoint = path[0] || ({ x: 0, y: 0 } as Vertex)
        const endPoint = path[path.length - 1] || ({ x: 0, y: 0 } as Vertex)

        const startFloor = getFloorByPoint(startPoint)
        const endFloor = getFloorByPoint(endPoint)

        const firstCurrentFloorPoint = floorPath[0] || ({ x: 0, y: 0 } as Vertex)
        const lastCurrentFloorPoint = floorPath[floorPath.length - 1] || ({ x: 0, y: 0 } as Vertex)

        if (startFloor === currentFloor) {
          drawCirclePoint(startPoint, "A")
        }

        if (endFloor === currentFloor) {
          drawCirclePoint(endPoint, "B")
        }

        if (endFloor < currentFloor) {
          drawCirclePoint(lastCurrentFloorPoint, "↓")
        } else if (endFloor > currentFloor) {
          drawCirclePoint(lastCurrentFloorPoint, "↑")
        } else if (startFloor === endFloor) {
          // Если начальная точка и кочная точка находятся на одном этаже, но, на пример, в разных корпусах.
          // И чтобы до них дойти, нужно подниматься или спускаться по лестницам
          const pointAfterLastCurrentFloorPoint = path[path.indexOf(lastCurrentFloorPoint) + 1]
          if (pointAfterLastCurrentFloorPoint) {
            const pointFloor = getFloorByPoint(pointAfterLastCurrentFloorPoint)
            if (pointFloor < currentFloor) {
              drawCirclePoint(lastCurrentFloorPoint, "↓")
            } else if (pointFloor > currentFloor) {
              drawCirclePoint(lastCurrentFloorPoint, "↑")
            }
          }
        }

        drawCirclePoint(firstCurrentFloorPoint, "")
      }
    },
    clearRoute: () => {
      if (!svgRef.current) return

      const svg = d3.select(svgRef.current)

      svg.selectAll(".route").remove()
      svg.selectAll(".circle-point").remove()
    },
  }))

  return <svg ref={svgRef} width={"100%"} height={"100%"} className={props.className}></svg>
})

MapRoute.displayName = "MapRoute"

export default MapRoute

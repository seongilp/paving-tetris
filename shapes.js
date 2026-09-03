// 보도블록 조각 정의. 충돌 판정은 셀 단위 직사각, 렌더링만 톱니(인터로킹).
import { H, V, S } from './pattern.js';

const flip = (orient) => (orient === H ? V : orient === V ? H : S);

function rotateCells(cells) {
  const maxY = Math.max(...cells.map((c) => c.y));
  const turned = cells.map((c) => ({ x: maxY - c.y, y: c.x, orient: flip(c.orient) }));
  const minX = Math.min(...turned.map((c) => c.x));
  const minY = Math.min(...turned.map((c) => c.y));
  return turned.map((c) => ({ x: c.x - minX, y: c.y - minY, orient: c.orient }));
}

const sameCells = (a, b) => {
  const norm = (cs) => cs.map((c) => `${c.x},${c.y},${c.orient}`).sort().join(';');
  return norm(a) === norm(b);
};

function buildRotations(base) {
  const list = [base];
  let cur = base;
  for (let i = 0; i < 3; i += 1) {
    cur = rotateCells(cur);
    if (list.some((r) => sameCells(r, cur))) break;
    list.push(cur);
  }
  return list;
}

// 기본 도형: I형 도미노(2×1), 맞물린 L자(3셀), 2×2 큰 판석
const DEFS = [
  { id: 'I', weight: 6, base: [{ x: 0, y: 0, orient: H }, { x: 1, y: 0, orient: H }] },
  {
    id: 'L',
    weight: 3,
    base: [
      { x: 0, y: 0, orient: H },
      { x: 1, y: 0, orient: H },
      { x: 1, y: 1, orient: V },
    ],
  },
  {
    id: 'Q',
    weight: 2,
    base: [
      { x: 0, y: 0, orient: S }, { x: 1, y: 0, orient: S },
      { x: 0, y: 1, orient: S }, { x: 1, y: 1, orient: S },
    ],
  },
];

export const SHAPES = DEFS.map((d) => ({
  id: d.id,
  weight: d.weight,
  rotations: buildRotations(d.base),
}));

const BAG = SHAPES.flatMap((s) => Array(s.weight).fill(s.id));

export function randomShapeId(rand = Math.random) {
  return BAG[Math.floor(rand() * BAG.length)];
}

export function shapeById(id) {
  return SHAPES.find((s) => s.id === id) || SHAPES[0];
}

export function cellsOf(shapeId, rotation) {
  const shape = shapeById(shapeId);
  return shape.rotations[rotation % shape.rotations.length];
}

export function rotationCount(shapeId) {
  return shapeById(shapeId).rotations.length;
}

export function boundsOf(cells) {
  return {
    w: Math.max(...cells.map((c) => c.x)) + 1,
    h: Math.max(...cells.map((c) => c.y)) + 1,
  };
}

// 조각의 바깥 윤곽(단위 변 목록). 인접 셀이 없는 변만 남긴다.
export function outlineEdges(cells) {
  const has = new Set(cells.map((c) => `${c.x},${c.y}`));
  const edges = [];
  for (const { x, y } of cells) {
    if (!has.has(`${x},${y - 1}`)) edges.push([x, y, x + 1, y]);
    if (!has.has(`${x + 1},${y}`)) edges.push([x + 1, y, x + 1, y + 1]);
    if (!has.has(`${x},${y + 1}`)) edges.push([x + 1, y + 1, x, y + 1]);
    if (!has.has(`${x - 1},${y}`)) edges.push([x, y + 1, x, y]);
  }
  return chain(edges);
}

// 방향이 이어지도록 변을 사슬로 연결
function chain(edges) {
  if (edges.length === 0) return [];
  const byStart = new Map();
  for (const e of edges) byStart.set(`${e[0]},${e[1]}`, e);
  const loop = [];
  let cur = edges[0];
  for (let i = 0; i < edges.length; i += 1) {
    loop.push(cur);
    byStart.delete(`${cur[0]},${cur[1]}`);
    const next = byStart.get(`${cur[2]},${cur[3]}`);
    if (!next) break;
    cur = next;
  }
  return loop;
}

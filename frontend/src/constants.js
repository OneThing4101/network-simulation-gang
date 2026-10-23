// Design tokens for the Engineering Atlas studio.
// The three topology hues are fixed by the assignment (MST red, 2-edge blue,
// full mesh green) and are never recoloured by scene. Everything else stays
// neutral so those three always read first on the map.
export const COLORS = {
  mst: '#D64545',
  protected: '#2F6FD0',
  full: '#2E8B5B',
};

export const TOPOLOGIES = [
  {key: 'mst', short: 'MST', name: 'Minimum Spanning Tree', hint: 'Суурь мод, нөөцгүй'},
  {key: 'protected', short: '2-Edge', name: '2-Edge-Connected', hint: 'MST + хамгийн хямд цагираг'},
  {key: 'full', short: 'Full mesh', name: 'Full mesh', hint: 'Бүх хос хот шууд холбоотой'},
];
export const TOPOLOGY_NAME = Object.fromEntries(TOPOLOGIES.map(t => [t.key, t.name]));
export const MONGOLIA_BOUNDS = [[41.4, 87.5], [52.3, 120]];
export const HIGHLIGHT = '#C27A12';
export const FAIL = '#B3261E';

export const SCENES = [
  {key: 'atlas', label: 'Атлас', hint: 'Сүлжээний зураглал ба сонголт'},
  {key: 'evolution', label: 'Хувьсгал', hint: 'Граф хэрхэн бүтсэнээс'},
  {key: 'resilience', label: 'Эрсдэл', hint: 'Тасралт, нөөц зам, нийтлэг зурвас'},
  {key: 'cost', label: 'Зардал', hint: 'Төсөв ба тэсвэрийн аралтын хязгаар'},
  {key: 'data', label: 'Өгөгдөл', hint: 'Зангилаа, трасс, эх сурвалж, экспорт'},
  {key: 'method', label: 'Аргачлал', hint: 'Алгоритм, таамаглал, хязгаарлал'},
];

export const LAYER_GROUPS = [
  {
    key: 'geography', label: 'Газарзүй',
    layers: [['mountain', 'Уулын бүс'], ['lake', 'Нуур'], ['river', 'Гол'], ['forest', 'Ой'], ['soums', 'Сум, аймаг']],
  },
  {
    key: 'network', label: 'Сүлжээ',
    layers: [['bridges', 'Bridge холбоос'], ['added', 'Нэмэлт нөөц холбоос'], ['access', 'Уулын нэвтрэх хэсэг'], ['gates', 'Голын гарц']],
  },
  {
    key: 'analysis', label: 'Анализ',
    layers: [['reroute', 'Нөөц зам'], ['corridor', 'Нийтлэг зурвас'], ['graticule', 'Өргөрөг утас']],
  },
];

export const LAYER_PRESETS = [
  {key: 'all', label: 'Бүгд'},
  {key: 'network', label: 'Зөвхөн сүлжээ'},
  {key: 'geography', label: 'Зөвхөн газарзүй'},
];

export const fmt = (x, digits = 0) => x == null ? '—' : Number(x).toLocaleString('en-US', {maximumFractionDigits: digits});
export const fmtKm = (x, digits = 0) => x == null ? '—' : `${fmt(x, digits)} км`;
export const fmtMs = (x, digits = 1) => x == null ? '—' : `${fmt(x, digits)} мс`;

// Mono figures keep columns aligned; tabular-nums stops the numbers dancing.
export const NUM = {fontVariantNumeric: 'tabular-nums', fontFamily: '"IBM Plex Mono", ui-monospace, monospace'};

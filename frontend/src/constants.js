export const COLORS = {mst: '#D64545', protected: '#2F6FD0', full: '#2E8B5B'};
export const TOPOLOGIES = [
  {key: 'mst', short: 'MST', name: 'Minimum Spanning Tree', hint: 'Суурь мод, нөөцгүй'},
  {key: 'protected', short: '2-Edge', name: '2-Edge-Connected', hint: 'MST + хамгийн хямд цагираг'},
  {key: 'full', short: 'Full mesh', name: 'Full mesh', hint: 'Бүх хос хот шууд холбоотой'},
];
export const TOPOLOGY_NAME = Object.fromEntries(TOPOLOGIES.map(t => [t.key, t.name]));
export const MONGOLIA_BOUNDS = [[41.4, 87.5], [52.3, 120]];
export const HIGHLIGHT = '#C27A12';
export const FAIL = '#B3261E';

export const fmt = (x, digits = 0) => x == null ? '—' : Number(x).toLocaleString('en-US', {maximumFractionDigits: digits});

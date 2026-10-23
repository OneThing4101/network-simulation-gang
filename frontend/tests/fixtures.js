// A trimmed copy of the API payload, so the component tests do not need a
// running server. The numbers match the recorded baseline.
export const cities = [
  {id: 'UB', lat: 47.92, lon: 106.92, name: 'Улаанбаатар'},
  {id: 'Darkhan', lat: 47.05, lon: 108.62, name: 'Дархан'},
  {id: 'Erdenet', lat: 49.03, lon: 104.04, name: 'Эрдэнэт'},
  {id: 'Zuunmod', lat: 47.33, lon: 107.0, name: 'Зуунмод'},
];

export const route = (id, u, v, extra = {}) => ({
  id, u, v, distance_km: 120.5, cost_km: 150.2, straight_km: 100.1,
  detour_pct: 20.3, mountain_access_km: 0, river_crossings: [], access: [], ...extra,
});

export const routes = [
  route('UB--Zuunmod', 'UB', 'Zuunmod'),
  route('UB--Darkhan', 'UB', 'Darkhan'),
  route('Darkhan--Erdenet', 'Darkhan', 'Erdenet'),
  route('Erdenet--Zuunmod', 'Erdenet', 'Zuunmod'),
];

export const stats = (over = {}) => ({
  nodes: 22, edges: 27, km: 9087.7, cost_km: 11239.3, overhead_pct: 54.3,
  connected: true, components: [[]], component_count: 1, bridge_count: 0, bridges: [],
  fault_tolerant: true, rtt_ms: 28.29, max_component_rtt_ms: 28.29, latency_pass: true,
  worst_pair: ['Olgii', 'Choibalsan'], diameter_km: 1529.3, ...over,
});

export const data = {
  cities,
  routes,
  excluded: [],
  cost_factors: {},
  compute_ms: 19.7,
  preprocessing: {grid_ms: 120, dijkstra_ms: 40},
  optimization: {
    status: 'optimal', gap: 0, added: ['UB--Zuunmod', 'Erdenet--Zuunmod'],
    added_cost_km: 3955.16, scope: 'Fixed Prim MST augmentation', global_2ec_optimum: false,
  },
  assumptions: ['Зай нь торон least-cost симуляцийн урт.'],
  topologies: {
    mst: {stats: stats({edges: 21, bridge_count: 21, bridges: ['UB--Zuunmod'], km: 5889.1, cost_km: 7284.1, overhead_pct: 0, rtt_ms: 38.49}), edge_ids: ['UB--Zuunmod', 'UB--Darkhan', 'Darkhan--Erdenet', 'Erdenet--Zuunmod']},
    protected: {stats: stats(), edge_ids: routes.map(r => r.id)},
    full: {stats: stats({edges: 231, km: 214426.9, cost_km: 240893.1, overhead_pct: 3541.1, rtt_ms: 21.8}), edge_ids: routes.map(r => r.id)},
  },
};

export const replay = {
  topology: 'protected', edge_id: 'UB--Zuunmod', scope: 'cable',
  scope_label: 'Нэг логик кабель', scope_basis: 'logical_edge',
  scope_note: 'Нэг логик ирмэг тасагдана.',
  failed_edges: ['UB--Zuunmod'], isolated: [],
  before: stats(), after: stats({bridge_count: 3, rtt_ms: 34.2}),
  frames: [
    {key: 'before', title: 'Эхний төлөв', caption: '27 кабель бүх хот холбогдсон.', failed_edges: [], components: [[]], reroute: [], reroute_edges: [], metrics: {connected: true, component_count: 1, isolated: 0, rtt_ms: 28.29, bridge_count: 0}},
    {key: 'failure', title: 'Гэмтэл илэрсэн', caption: 'Нэг кабель тасарлаа.', failed_edges: ['UB--Zuunmod'], components: [['UB'], ['Darkhan']], reroute: [], reroute_edges: [], metrics: {connected: true, component_count: 2, isolated: 0, rtt_ms: null, bridge_count: null}},
    {key: 'reroute', title: 'Нөөц зам', caption: 'Нөөц чиглэл олдсон: 773 км, RTT 7.7 мс.', failed_edges: ['UB--Zuunmod'], components: [['UB'], ['Darkhan']], reroute: ['UB', 'Erdenet', 'Zuunmod'], reroute_edges: ['Erdenet--UB', 'Erdenet--Zuunmod'], metrics: {connected: true, component_count: 2, isolated: 0, rtt_ms: 7.7, delta_rtt_ms: -20.6, bridge_count: null}},
    {key: 'after', title: 'Шинэ төлөв', caption: 'Тасралтын дараа 3 bridge, хамгийн их RTT 34.2 мс.', failed_edges: ['UB--Zuunmod'], components: [['UB'], ['Darkhan']], reroute: ['UB', 'Erdenet', 'Zuunmod'], reroute_edges: ['Erdenet--UB', 'Erdenet--Zuunmod'], metrics: {connected: true, component_count: 2, isolated: 0, rtt_ms: 34.2, bridge_count: 3}},
  ],
};

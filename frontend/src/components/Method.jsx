import { ArrowUpRight } from 'lucide-react';
import { COLORS, TOPOLOGIES, fmt } from '../constants';

// Reading view: data provenance, algorithms, and what the numbers do and do not mean.
export default function Method({data}) {
  const opt = data.optimization;
  return <section className="doc"><div className="doc-inner">
    <h1>Аргачлал ба хязгаарлалт</h1>
    <p className="lede">Энэ бол шалгаж болох симуляци: өгөгдөл хаанаас ирсэн, ямар алгоритм ажилласан, тоо бүр юуг хэлж, юуг хэлэхгүйг энд тайлбарлана.</p>

    <h2>Одоогийн тооцооны үр дүн</h2>
    <table className="doc-table"><thead><tr><th>Топологи</th><th className="num">Кабель</th><th className="num">Урт, км</th><th className="num">Өртөг, w-км</th><th className="num">Bridge</th><th className="num">Их RTT, мс</th></tr></thead>
      <tbody>{TOPOLOGIES.map(t => { const s = data.topologies[t.key].stats; return <tr key={t.key}><td><span className="swatch mr-2 align-middle" style={{background: COLORS[t.key]}}/>{t.name}</td><td className="num">{s.edges}</td><td className="num">{fmt(s.km, 1)}</td><td className="num">{fmt(s.cost_km, 1)}</td><td className="num">{s.bridge_count}</td><td className="num">{fmt(s.rtt_ms, 2)}</td></tr>; })}</tbody></table>
    <p>Оптимизатор: {opt.status}, gap {fmt(opt.gap * 100, 4)}%. {opt.added.length} нэмэлт холбоос, нийт {fmt(opt.added_cost_km)} weighted-км. Топологи бодсон хугацаа {fmt(data.compute_ms, 1)} мс; газарзүйн торын бэлтгэл {fmt(data.preprocessing?.grid_ms)} мс, Dijkstra {fmt(data.preprocessing?.dijkstra_ms)} мс.</p>

    <h2>Газарзүй: уул, усыг тойрох</h2>
    <p>WGS84 солбицлыг Монголын төвд тохируулсан Lambert Azimuthal Equal Area метрийн проекцод хувиргаж 5 км алхамтай тор байгуулна. Нуур 1 км, гол 0.5 км, уулын бүс 1 км хамгаалалтын зурвастай. Нуур, уул, улсын хил огтлох хэрчмийг торноос хасна; хэрчмийн хоёр төгсгөл боломжтой байсан ч бүтэн шугам саад огтолбол хориглоно.</p>
    <p>Голыг бүрэн хаахад тор салангид хэсгүүдэд хуваагддаг тул голын хоёр эргийг холбох 7 санал болгосон гарц зарласан. Гарц бүр 100 weighted-км нэмэлт өртөгтэй. Эдгээр нь бодит гүүрийн бүртгэл биш; газар дээр судалж баталгаажуулах шаардлагатай.</p>
    <p>Уулын өргөн polygon дотор байрлах хотыг тусгаарлахгүйн тулд хамгийн ойрын боломжит торонд хүрэх «нэвтрэх хэсэг» байгуулж, уртыг нь тусад нь бүртгэнэ. Карт дээр шар тасархайгаар харагдана, «уул тойрсон» гэж тооцохгүй.</p>

    <h2>Оновчлол: Prim MST + бинар MILP</h2>
    <p>Хот бүрээс саадгүй торон граф дээр Dijkstra ажиллуулж {data.routes.length} боломжит трасс үүсгэнэ. Ойн нүдний үржвэр 2.5. Тэдгээрийн terrain-weighted өртгийг жин болгон Prim-ийн алгоритмаар хамгийн бага бүрхэгч мод олно. Модны бүх ирмэг bridge тул дан MST нэг кабелийн тасралтыг даахгүй.</p>
    <p>Нэмэлт холбоос j бүрт бинар хувьсагч x<sub>j</sub>, өртөг c<sub>j</sub>. Зорилго: min Σ c<sub>j</sub>x<sub>j</sub>. Модны холбоос i бүрийн хувьд Σ A<sub>ij</sub>x<sub>j</sub> ≥ 1, энд нэмэлт холбоосын fundamental cycle i-г хамарвал A<sub>ij</sub> = 1. Бүх модны холбоос дор хаяж нэг cycle-д орвол bridge үлдэхгүй. SciPy/HiGHS-ээр бодно. Энэ баталгаа сонгосон нэг MST ба өгсөн боломжит трассын хүрээнд хамаарна; бүх 2-edge-connected сүлжээний глобал оптимум гэж үзэхгүй.</p>

    <h2>Найдвартай байдал: тасалж байж шалгана</h2>
    <p>Tarjan-ийн low-link DFS алгоритм O(V+E) хугацаанд bridge илрүүлнэ; хэрэгжилтийг 30 санамсаргүй граф дээр NetworkX-ийн үр дүнтэй тулгасан. Тасралтын симуляци сонгосон кабелийг хасаад холбоотой байдлыг шалгаж, Улаанбаатарын component-оос гадуур үлдсэн хотыг салсан гэж жагсаана. Нөөц чиглэл нь тасарсан кабельгүй графын жинтэй хамгийн богино зам.</p>
    <p>«Нэг зурвасын давхцсан кабель» горим нь нэг зурваст давхцсан бүх кабелийг нэгэн зэрэг тасалдаг shared-risk туршилт. Логик 2-edge баталгаа газар дээрх давхцсан суваг, төхөөрөмжийн гэмтлийг хамрахгүй гэдгийг энэ горим ил харуулна.</p>

    <h2>Тоо юуг хэлэх вэ</h2>
    <ul>{data.assumptions.map((a, i) => <li key={i}>{a}</li>)}</ul>

    <h2>Өгөгдлийн гарал үүсэл</h2>
    <p>Хил, аймаг, нуур, уул: өгсөн Natural Earth 1:10m excerpt. Гол: Natural Earth 1:10m. Ой: эх notebook-ийн гараар тэмдэглэсэн ойролцоо бүс. Хот: эх ажлын 22 солбицол. Аймаг, сумын хил ба нэр: GADM 4.1 (2022), картыг ойртуулахад гарч ирнэ; зөвхөн чиг баримжааны зориулалттай. Суурь vector карт интернэтгүй ажиллана; OSM давхарга л онлайн tile ашиглана.</p>
    <p className="sources"><a className="link" href="https://www.naturalearthdata.com/" target="_blank" rel="noreferrer">Natural Earth <ArrowUpRight size={13}/></a><a className="link" href="https://docs.scipy.org/doc/scipy/reference/generated/scipy.optimize.milp.html" target="_blank" rel="noreferrer">SciPy MILP <ArrowUpRight size={13}/></a><a className="link" href="https://networkx.org/documentation/stable/reference/algorithms/bridges.html" target="_blank" rel="noreferrer">NetworkX bridges <ArrowUpRight size={13}/></a><a className="link" href="https://gadm.org/" target="_blank" rel="noreferrer">GADM <ArrowUpRight size={13}/></a></p>
  </div></section>;
}

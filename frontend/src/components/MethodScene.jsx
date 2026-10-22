import {ArrowUpRight} from 'lucide-react';
import {COLORS, TOPOLOGIES, fmt} from '../constants';

// The reading view. Same numbers as the studio, with the method spelled out.
export default function MethodScene({data}) {
  const opt = data.optimization;
  const stats = data.topologies;

  return <div className="doc-scroll">
    <article className="doc">
      <h1>Аргачлал ба хязгаарлалт</h1>
      <p className="lede">Энэ бол шалгаж болох симуляци: өгөгдөл хаанаас ирсэн, ямар алгоритм ажилласан, тоо бүр юуг хэлж, юуг хэлэхгүйг энд тайлбарлана.</p>

      <h2>Одоогийн тооцооны үр дүн</h2>
      <table className="table">
        <thead><tr><th>Топологи</th><th className="num">Кабель</th><th className="num">Урт, км</th><th className="num">Өртөг, w-км</th><th className="num">Bridge</th><th className="num">Хамгийн их RTT, мс</th></tr></thead>
        <tbody>{TOPOLOGIES.map(item => {
          const s = stats[item.key]?.stats;
          if (!s) return <tr key={item.key}><td><span className="swatch mr-2 align-middle" style={{background: COLORS[item.key]}}/>{item.name}</td><td className="num" colSpan={5}>2-edge-connected хувилбар байгуулах боломжгүй</td></tr>;
          return <tr key={item.key}>
            <td><span className="swatch mr-2 align-middle" style={{background: COLORS[item.key]}}/>{item.name}</td>
            <td className="num">{s.edges}</td><td className="num">{fmt(s.km, 1)}</td><td className="num">{fmt(s.cost_km, 1)}</td>
            <td className="num">{s.bridge_count}</td><td className="num">{s.rtt_ms == null ? '—' : fmt(s.rtt_ms, 2)}</td>
          </tr>;
        })}</tbody>
      </table>
      <p className="prose" style={{marginTop: 8}}>
        Оптимизатор: <strong>{opt.status}</strong>, gap {fmt(opt.gap * 100, 4)}%. {(opt.added || []).length} нэмэлт холбоос, нийт {fmt(opt.added_cost_km)} weighted-км.
        Графыг бодоход {fmt(data.compute_ms, 1)} мс; газарзүйн торын бэлтгэл {fmt(data.preprocessing?.grid_ms)} мс, Dijkstra {fmt(data.preprocessing?.dijkstra_ms)} мс.
      </p>

      <h2>Газарзүй: уул, усыг тойрох</h2>
      <p className="prose">WGS84 солбицлыг Монголын төвд тохируулсан Lambert Azimuthal Equal Area метрийн проекцод хувиргаж 5 км алхамтай тор байгуулна. Нуур 1 км, гол 0.5 км, уулын бүс 1 км хамгаалалтын зурвастай. Нуур, уул, улсын хил огтлох хэрчмийг торноос хасна; хэрчмийн хоёр төгсгөл боломжтой байсан ч бүтэн шугам саад огтолбол хориглоно.</p>
      <p className="prose">Голыг бүрэн хаахад тор салангид хэсгүүдэд хуваагддаг тул голын хоёр эргийг холбох санал болгосон гарц зарласан. Гарц бүр 100 weighted-км нэмэлт өртөгтэй. Эдгээр нь бодит гүүрийн бүртгэл биш; газар дээр судалж баталгаажуулах шаардлагатай.</p>
      <p className="prose">Уулын өргөн polygon дотор байрлах хотыг тусгаарлахгүйн тулд хамгийн ойрын боломжит торонд хүрэх «нэвтрэх хэсэг» байгуулж, уртыг нь тусад нь бүртгэнэ. Карт дээр шар тасархайгаар харагдана, «уул тойрсон» гэж тооцохгүй.</p>

      <h2>Оновчлол: Prim MST + бинар MILP</h2>
      <p className="prose">Хот бүрээс саадгүй торон граф дээр Dijkstra ажиллуулж {data.routes.length} боломжит трасс үүсгэнэ. Ойн нүдний үржвэр 2.5. Тэдгээрийн terrain-weighted өртгийг жин болгон Prim-ийн алгоритмаар хамгийн бага бүрхэгч мод олно. Модны бүх ирмэг bridge тул дан MST нэг кабелийн тасралтыг даахгүй.</p>
      <p className="prose">Нэмэлт холбоос <em>j</em> бүрт бинар хувьсагч <em>x<sub>j</sub></em>, өртөг <em>c<sub>j</sub></em>. Зорилго: min Σ <em>c<sub>j</sub>x<sub>j</sub></em>. Модны холбоос <em>i</em> бүрийн хувьд Σ <em>A<sub>ij</sub>x<sub>j</sub></em> ≥ 1, энд нэмэлт холбоосын fundamental cycle <em>i</em>-г хамарвал <em>A<sub>ij</sub></em> = 1. Бүх модны холбоос дор хаяж нэг cycle-д орвол bridge үлдэхгүй. SciPy/HiGHS-ээр бодно.</p>
      <div className="callout callout-amber" style={{margin: '12px 0'}}>
        <AlertTriangleIcon/>
        <span>Энэ баталгаа <strong>сонгосон нэг MST ба өгсөн боломжит трассын хүрээнд</strong> хамаарна. Бүх 2-edge-connected сүлжээний глобал оптимум гэж үзэхгүй.</span>
      </div>

      <h2>Найдвартай байдал: тасалж байж шалгана</h2>
      <p className="prose">Tarjan-ийн low-link DFS алгоритм O(V+E) хугацаанд bridge илрүүлнэ; хэрэгжилтийг санамсаргүй граф дээр NetworkX-ийн үр дүнтэй тулгасан. Тасралтын симуляци сонгосон кабелийг хасаад холбоотой байдлыг шалгаж, Улаанбаатарын component-оос гадуур үлдсэн хотыг салсан гэж жагсаана. Нөөц чиглэл нь тасарсан кабельгүй графын жинтэй хамгийн богино зам.</p>
      <p className="prose">Гэмтлийн хамрах хүрээ гурван төрөлтэй. <strong>Нэг логик кабель</strong> — ганц холбоос тасах баталгаа. <strong>Дунд цэгийн сэжиглэл</strong> — зөвхөн сонгосон кабелийн дунд цэгийг шалгах heuristic, өмнөх baseline. <strong>Геометр дээрх нийтлэг зурвас</strong> — проекцласан метр зангилаанд зурвасын өргөн хүрээний давхцлыг тооцох шинэ загвар.</p>

      <h2>Логик тэсвэр ба газар дээрх тусгаарлал</h2>
      <p className="prose">Логик 2-edge баталгаа нь <strong>хоёр дахь логик зам оршино</strong> гэсэн баталгаа. Гэтэл хоёр кабель нэг уулын хөрөн дээр, нэг голын гарц дээр, нэг суваг дагуу дараалсан бол нэг шахалын ажил хоёуланг нь унагаж болно. Тиймээс 2-edge-connected сүлжээ нь газар дээрх суваг, төхөөрөмжийн гэмтлийг хамгаалах баталгаа биш.</p>

      <h2>Тоо юуг хэлэх вэ</h2>
      <ul className="prose">{data.assumptions.map((item, index) => <li key={index} style={{marginBottom: 4}}>{item}</li>)}</ul>

      <h2>Өгөгдлийн гарал үүсэл</h2>
      <p className="prose">Хил, аймаг, нуур, уул: өгсөн Natural Earth 1:10m excerpt. Гол: Natural Earth 1:10m. Ой: эх notebook-ийн гараар тэмдэглэсэн ойролцоо бүс. Хот: эх ажлын 22 солбицол. Аймаг, сумын хил ба нэр: GADM 4.1 (2022), картыг ойртуулахад гарч ирнэ; зөвхөн чиг баримжааны зориулалттай. Суурь vector карт интернэтгүй ажиллана; OSM давхарга л онлайн tile ашиглана.</p>
      <p className="sources">
        <a className="link" href="https://www.naturalearthdata.com/" target="_blank" rel="noreferrer">Natural Earth <ArrowUpRight size={13}/></a>
        <a className="link" href="https://docs.scipy.org/doc/scipy/reference/generated/scipy.optimize.milp.html" target="_blank" rel="noreferrer">SciPy MILP <ArrowUpRight size={13}/></a>
        <a className="link" href="https://networkx.org/documentation/stable/reference/algorithms/bridges.html" target="_blank" rel="noreferrer">NetworkX bridges <ArrowUpRight size={13}/></a>
        <a className="link" href="https://gadm.org/" target="_blank" rel="noreferrer">GADM <ArrowUpRight size={13}/></a>
      </p>
    </article>
  </div>;
}

function AlertTriangleIcon() {
  return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
    <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z"/><path d="M12 9v4M12 17h.01"/>
  </svg>;
}

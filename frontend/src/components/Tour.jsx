import { X } from 'lucide-react';

// A guided 10-step walkthrough for the class presentation. Each step moves the UI into the state it talks about.
export const TOUR_STEPS = [
  {title: 'Нөөцтэй сүлжээ', text: '2-Edge топологи: 27 кабель, bridge 0, хамгийн их RTT 50 мс-ээс бага. Зүүн талд нийт урт, критик холбоос, RTT харагдана.', run: c => { c.setTab('design'); c.setTopology('protected'); c.clear(); }},
  {title: 'MST бүхэлдээ bridge', text: 'Хамгийн бага бүрхэгч мод 21 кабельтэй. Бүгд тасархай зураастай: кабель бүр bridge тул аль нэг нь тасрахад сүлжээ салдаг.', run: c => { c.setTab('failure'); c.setTopology('mst'); c.clear(); }},
  {title: 'MST дээр кабель тасаллаа', text: 'Алтай — Ховд кабель тасрахад баруун бүсийн дөрвөн хот Улаанбаатараас салж, улаанаар тэмдэглэгдэнэ.', run: async c => { c.setTab('failure'); c.setTopology('mst'); c.setScope('cable'); await c.cut('mst', 'Altai--Khovd', 'cable'); }},
  {title: '2-Edge дээр мөн адил тасралт', text: 'Нөөц замтай топологид мөн тэр кабель тасарсан ч бүх хот холбоотой үлдэнэ. Шар зураас нь урсгалын нөөц чиглэл, урт ба RTT нь баруун талд.', run: async c => { c.setTab('failure'); c.setTopology('protected'); c.setScope('cable'); await c.cut('protected', 'Altai--Khovd', 'cable'); }},
  {title: 'Бүх кабелийг шалгах', text: 'Бүрэн шалгалт: 2-Edge 27/27, Full mesh 231/231 холбоотой үлдэнэ. MST 0/21.', run: async c => { c.setTab('failure'); c.setTopology('protected'); c.clear(); await c.audit(); }},
  {title: 'Нэг зурвасын хам эрсдэл', text: 'Хамрах хүрээг «нэг зурвасын давхцсан кабель» болгоход логик нөөц ба физик хам эрсдэлийн ялгаа харагдана.', run: async c => { c.setTab('failure'); c.setTopology('protected'); c.setScope('corridor'); await c.cut('protected', 'Murun--Uliastai', 'corridor'); }},
  {title: 'Хоёр хотын зам', text: 'Дархан — Хэнтий хамгийн богино замыг одоогийн топологи, тасралтын төлөвийг тооцон бодно.', run: async c => { c.setTab('design'); c.setTopology('protected'); c.clear(); c.setSource('Darkhan'); c.setTarget('Khentii'); await c.path('protected', 'Darkhan', 'Khentii'); }},
  {title: 'Өгөгдөл засах', text: 'Зангилаа нэмэх, засах, хасах. Трассыг боломжит сангаас хасах, сэргээх. Байршил өөрчлөгдөхөд маршрут дахин бодогдоно.', run: c => { c.setTab('manage'); c.clear(); }},
  {title: 'Экспорт', text: 'Баруун дээд булангийн Экспорт цэснээс сонгосон топологийг GeoJSON, CSV, эсвэл бүтэн JSON хэлбэрээр авна.', run: c => { c.setTab('design'); c.setTopology('protected'); c.clear(); }},
  {title: 'Аргачлал', text: 'Өгөгдлийн гарал, алгоритм, тооцооны таамаг ба хязгаарлалт. Энэ бол сургалтын симуляци бөгөөд инженерийн баталгаатай трасс биш.', run: c => { c.setTab('method'); }},
];

export default function Tour({step, onStep, onClose, running}) {
  const s = TOUR_STEPS[step];
  return <div className="map-float tour" role="dialog" aria-label="Танилцуулга">
    <div>
      <header><span>Танилцуулга · {step + 1} / {TOUR_STEPS.length}</span><button onClick={onClose} aria-label="Танилцуулгыг хаах"><X size={16}/></button></header>
      <h3>{s.title}</h3>
      <p>{s.text}</p>
      <footer>
        <div className="steps">{TOUR_STEPS.map((_, i) => <i key={i} className={i <= step ? 'done' : ''}/>)}</div>
        <button className="btn btn-sm" disabled={step === 0 || running} onClick={() => onStep(step - 1)}>Өмнөх</button>
        <button className="btn btn-sm btn-primary" disabled={running} onClick={() => step === TOUR_STEPS.length - 1 ? onClose() : onStep(step + 1)}>{step === TOUR_STEPS.length - 1 ? 'Дуусгах' : 'Дараах'}</button>
      </footer>
    </div>
  </div>;
}

import { X, RotateCcw } from 'lucide-react';

export default function NodeModal({modal, busy, error, onClose, onSubmit, onPickOnMap, onDelete, onReset}) {
  if (modal.type === 'reset') return <div className="backdrop" onClick={onClose}><div className="modal" role="dialog" aria-modal="true" aria-label="Анхны төлөв сэргээх" onClick={e => e.stopPropagation()}>
    <button className="modal-close" aria-label="Цонх хаах" onClick={onClose}><X size={18}/></button>
    <RotateCcw size={22} className="mb-3 text-slate"/>
    <h2>Анхны 22 хотын төлөвт буцах уу?</h2>
    <p>Вэбээр хийсэн зангилаа, трассын засвар устаж анхны хувилбар сэргэнэ. Эх notebook болон газарзүйн файлууд өөрчлөгдөхгүй. Хадгалахыг хүсвэл эхлээд JSON экспорт хийнэ үү.</p>
    <div className="flex gap-2"><button className="btn btn-primary" disabled={!!busy} onClick={onReset}>Анхны төлөв сэргээх</button><button className="btn" onClick={onClose}>Болих</button></div>
  </div></div>;

  const isNew = modal.type === 'new';
  return <div className="backdrop" onClick={onClose}><div className="modal" role="dialog" aria-modal="true" aria-label={isNew ? 'Зангилаа нэмэх' : 'Зангилаа засах'} onClick={e => e.stopPropagation()}>
    <button className="modal-close" aria-label="Цонх хаах" onClick={onClose}><X size={18}/></button>
    <h2>{isNew ? 'Зангилаа нэмэх' : `${modal.name} засах`}</h2>
    <p>Байршил өөрчлөгдөхөд саадыг тооцсон бүх трасс дахин бодогдоно. Солбицол Монголын хил дотор байх ёстой.</p>
    {error && <div className="alert mb-3" role="alert">{error}</div>}
    <form className="form-grid" onSubmit={e => { e.preventDefault(); onSubmit(Object.fromEntries(new FormData(e.target))); }}>
      <label className="field"><span>ID (латин үсэг, тоо)</span><input className="input" name="id" required pattern="[A-Za-z0-9_]{1,32}" defaultValue={modal.id || ''} readOnly={!isNew}/></label>
      <label className="field"><span>Хотын нэр</span><input className="input" name="name" required maxLength="60" defaultValue={modal.name || ''} autoFocus/></label>
      <div className="form-grid two">
        <label className="field"><span>Өргөрөг</span><input className="input" name="lat" type="number" step="any" min="41" max="53" required defaultValue={modal.lat}/></label>
        <label className="field"><span>Уртраг</span><input className="input" name="lon" type="number" step="any" min="87" max="121" required defaultValue={modal.lon}/></label>
      </div>
      <div className="flex flex-wrap gap-2 mt-1">
        <button type="submit" className="btn btn-primary" disabled={!!busy}>{busy ? 'Бодож байна…' : 'Хадгалж тооцоолох'}</button>
        <button type="button" className="btn" onClick={e => onPickOnMap(Object.fromEntries(new FormData(e.currentTarget.form)))}>Карт дээр сонгох</button>
      </div>
    </form>
    {!isNew && modal.id !== 'UB' && <button className="link link-danger mt-4" disabled={!!busy} onClick={onDelete}>Энэ зангилааг хасах</button>}
  </div></div>;
}

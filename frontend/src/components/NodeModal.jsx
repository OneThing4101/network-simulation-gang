import {useEffect, useRef, useState} from 'react';
import {MapPin, X} from 'lucide-react';

// The dialog traps focus, restores it on close and closes on Escape.
export default function NodeModal({modal, busy, error, onClose, onSubmit, onPickOnMap, onDelete, onReset}) {
  const [values, setValues] = useState({id: '', name: '', lat: 47.9, lon: 106.9});
  const dialog = useRef(null);
  const first = useRef(null);

  useEffect(() => {
    if (!modal) return;
    setValues(modal.type === 'edit'
      ? {id: modal.id, name: modal.name, lat: modal.lat, lon: modal.lon}
      : {id: '', name: '', lat: 47.9, lon: 106.9});
    first.current?.focus();
  }, [modal]);

  useEffect(() => {
    if (!modal) return;
    const onKey = event => {
      if (event.key === 'Escape') { onClose(); return; }
      if (event.key !== 'Tab') return;
      const focusable = dialog.current?.querySelectorAll('button, input, select, textarea, a[href]');
      if (!focusable?.length) return;
      const edges = [focusable[0], focusable[focusable.length - 1]];
      if (event.shiftKey && document.activeElement === edges[0]) { event.preventDefault(); edges[1].focus(); }
      else if (!event.shiftKey && document.activeElement === edges[1]) { event.preventDefault(); edges[0].focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [modal, onClose]);

  if (!modal) return null;
  const isReset = modal.type === 'reset';

  return <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
    <div className="modal" role="dialog" aria-modal="true" aria-label={isReset ? 'Суурь төлөв' : 'Зангилаа'} ref={dialog}>
      <div className="modal-head">
        <h3>{isReset ? 'Суурь төлөвт буцаах' : modal.type === 'edit' ? 'Зангилаа засах' : 'Шинэ зангилаа'}</h3>
        <button className="btn btn-sm btn-ghost" onClick={onClose} aria-label="Хаах"><X size={14}/></button>
      </div>

      {isReset ? <>
        <div className="modal-body">
          <p className="prose">Бүх засвар хасагдаж, анхны 22 хотын төлөв болон бүх 231 боломжит трасс эргэж ирнэ. Энэ үйлдэл буцаар хуваагдахгүй.</p>
        </div>
        <div className="modal-foot">
          <button className="btn" onClick={onClose}>Болих</button>
          <button className="btn btn-primary" disabled={!!busy} onClick={onReset}>Суурь төлөвт буцаах</button>
        </div>
      </> : <>
        <div className="modal-body">
          {modal.type === 'new' && <label className="field">
            <span>ID (латин үсэг, тоо)</span>
            <input className="input" ref={first} value={values.id} onChange={e => setValues({...values, id: e.target.value})}/>
          </label>}
          <label className="field">
            <span>Нэр</span>
            <input className="input" value={values.name} onChange={e => setValues({...values, name: e.target.value})}/>
          </label>
          <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10}}>
            <label className="field">
              <span>Өргөрөг (N)</span>
              <input className="input num" type="number" step="0.0001" value={values.lat} onChange={e => setValues({...values, lat: e.target.value})}/>
            </label>
            <label className="field">
              <span>Уртраг (E)</span>
              <input className="input num" type="number" step="0.0001" value={values.lon} onChange={e => setValues({...values, lon: e.target.value})}/>
            </label>
          </div>
          <button className="btn" onClick={() => onPickOnMap(values)}><MapPin size={14}/>Газрын зураг дээр сонгох</button>
          {error && <div className="error-banner" role="alert"><span>{error}</span></div>}
        </div>
        <div className="modal-foot">
          {modal.type === 'edit' && <button className="btn" style={{marginRight: 'auto', color: 'var(--color-fail)'}} disabled={!!busy} onClick={onDelete}>Хасах</button>}
          <button className="btn" onClick={onClose}>Болих</button>
          <button className="btn btn-primary" disabled={!!busy} onClick={() => onSubmit(values)}>{busy ? 'Тооцоо хийгдэж байна…' : 'Хадгалах'}</button>
        </div>
      </>}
    </div>
  </div>;
}

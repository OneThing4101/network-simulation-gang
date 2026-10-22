import {Component} from 'react';
import {AlertTriangle, RotateCcw} from 'lucide-react';

// A rendering fault must not blank the studio. The reader sees what broke and
// can reload the view without losing the server session.
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = {error: null};
  }

  static getDerivedStateFromError(error) {
    return {error};
  }

  componentDidCatch(error, info) {
    console.error('Fiber Atlas render error', error, info);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return <div className="loading">
      <div className="error-banner" role="alert">
        <AlertTriangle size={16}/>
        <span>Дүрслэлд алдаа гарлаа: {String(this.state.error?.message || this.state.error)}</span>
      </div>
      <p className="prose">Сервер дээрх загвар хэвээр байна. Дараах товчоор хувийн төлөвөөс дахин эхлэж болно.</p>
      <button className="btn" onClick={() => window.location.reload()}><RotateCcw size={14}/>Дахин ачаалах</button>
    </div>;
  }
}

// सार्वजनिक प्रशिक्षण व्हिडिओ पान (लॉगिन न करता) — /training
import PublicHeader from '../components/PublicHeader.jsx';
import TrainingVideo from '../components/TrainingVideo.jsx';

export default function Training() {
  return (
    <div className="public-page">
      <PublicHeader title="प्रशिक्षण व्हिडिओ" />
      <div className="form-card"><TrainingVideo /></div>
    </div>
  );
}

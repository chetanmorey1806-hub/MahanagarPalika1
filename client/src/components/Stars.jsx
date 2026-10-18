// ★ रेटिंग दाखवा (अर्धा स्टार सपोर्ट) किंवा निवडा (onChange दिल्यास)
export default function Stars({ value = 0, onChange, size = 20 }) {
  return (
    <span className="stars" style={{ fontSize: size }} aria-label={`${value} / 5`}>
      {[1, 2, 3, 4, 5].map((i) => {
        const fill = value >= i ? 'full' : value >= i - 0.5 ? 'half' : '';
        return onChange
          ? <button key={i} type="button" className={`star ${fill}`} onClick={() => onChange(i)}>★</button>
          : <span key={i} className={`star ${fill}`}>★</span>;
      })}
    </span>
  );
}

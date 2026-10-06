import ExperimentalYayoiQuotes from "./components/ExperimentalYayoiQuotes";
import YayoiPointCanvas from "./components/YayoiPointCanvas";

export default function HomePage() {
  return (
    <main className="digi-tales-stage" aria-label="Experiencia puntillista digi Tales">
      <YayoiPointCanvas active />
      <ExperimentalYayoiQuotes active />
      <div className="digi-tales-mark" aria-hidden="true">
        <strong>digi</strong>
        <span>Tales</span>
      </div>
    </main>
  );
}

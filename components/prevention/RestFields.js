import styles from './Prevention.module.css';
const fields = [['A', 'Между упражнениями A'], ['B', 'Между упражнениями B'], ['C', 'Между упражнениями C'], ['roundA', 'Между кругами A'], ['roundB', 'Между кругами B'], ['roundC', 'Между кругами C'], ['block', 'Между блоками'], ['side', 'Между сторонами']];
export default function RestFields({ value, onChange, disabled }) {
  return <details className={styles.details}><summary>Настроить паузы · секунды</summary><p>Паузы добавлены тренером к исходному PDF. После последнего подхода отдых не запускается.</p><div className={styles.restGrid}>{fields.map(([key, label]) => <label className={styles.field} key={key}>{label}<input className={styles.input} type="number" min="0" max="300" step="5" inputMode="numeric" value={value[key] ?? ''} disabled={disabled} onChange={e => onChange({ ...value, [key]: e.target.value === '' ? '' : Number(e.target.value) })} /></label>)}</div></details>;
}

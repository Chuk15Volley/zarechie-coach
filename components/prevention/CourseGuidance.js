import styles from './Prevention.module.css';
export default function CourseGuidance({ guidance = [] }) {
  if (!guidance.length) return null;
  return <details className={styles.details}><summary>Рекомендации к курсу · из PDF</summary>{guidance.map(item => <section key={item.title} className={styles.block}><h4>{item.title}</h4><p>{item.text}</p><p className={styles.source}>{item.sourceTitle} · стр. {item.pages}</p></section>)}</details>;
}

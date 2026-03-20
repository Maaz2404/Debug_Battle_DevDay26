import type { Question } from "@/lib/types";
import styles from "./QuestionPanel.module.css";

interface QuestionPanelProps {
  question: Question | null;
}

export function QuestionPanel({ question }: QuestionPanelProps) {
  if (!question) {
    return (
      <section className={styles.empty}>
        Waiting for the next question...
      </section>
    );
  }

  return (
    <section className={styles.panel}>
      <div>
        <p className={styles.problemLabel}>Problem</p>
        <h2 className={styles.title}>{question.title}</h2>
      </div>

      <div>
        <h3 className={styles.sectionTitle}>Description</h3>
        <p className={styles.description}>{question.description}</p>
      </div>

      <div className={styles.samples}>
        <div>
          <h3 className={styles.sectionTitle}>Sample Input</h3>
          <pre className={styles.sampleCode}>{question.sampleInput}</pre>
        </div>
        <div>
          <h3 className={styles.sectionTitle}>Sample Output</h3>
          <pre className={styles.sampleCode}>{question.sampleOutput}</pre>
        </div>
      </div>

      <div>
        <h3 className={styles.sectionTitle}>Constraints</h3>
        <ul className={styles.constraints}>
          {question.constraints.map((item) => (
            <li key={item} className={styles.constraintItem}>
              {item}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

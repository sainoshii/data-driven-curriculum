import type { PlanData } from './data/curriculum'
import './plan-transfers.css'

type PlanItem = PlanData['items'][number]

const number = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 })

function TransferEvidence({ item, threshold, label }: {
  item: PlanItem
  threshold: number
  label: string
}) {
  const { below_threshold_pct: below, result_count: count } = item.scores
  return <div>
    <dt>{label} · {item.topic_name}</dt>
    <dd>
      {below === null ? 'Нет данных о доле ниже порога.' : <>
        <b>{number.format(below)}%</b> ниже {threshold} баллов · выборка {number.format(count)}
      </>}
    </dd>
    <dd>Часы темы в плане · {item.current_hours} → {item.proposed_hours} ч</dd>
  </div>
}

export default function PlanTransfers({ plan, isManual }: { plan: PlanData; isManual: boolean }) {
  const items = new Map(plan.items.map(item => [item.topic_id, item]))

  return <section className="plan-section" aria-labelledby="transfers-title">
    <h2 id="transfers-title">Откуда и куда переносятся часы</h2>
    {isManual ? (
      <p className="transfer-note">Переносы показывают итоговую разницу между исходным планом и вашим вариантом. Последнюю правку методиста можно посмотреть в блоке «Что если?».</p>
    ) : (
      <details className="transfer-rules">
        <summary>Правила автоматического расчёта</summary>
        <p>
          Считаем долю результатов ниже {plan.mastery_threshold} баллов. Для каждой темы нужно минимум 20 результатов.
          Тема может отдать часы при доле до 10% включительно и получить часы при доле от 50%.
          Автоматический расчёт меняет часы темы максимум на 2 часа, соблюдает её минимум и максимум и сохраняет общий бюджет.
        </p>
      </details>
    )}
    {plan.transfers.length > 0 ? (
      <ul className="transfer-list">
        {plan.transfers.map(transfer => {
          const { from_topic_id: fromId, to_topic_id: toId, hours } = transfer
          const from = items.get(fromId)
          const to = items.get(toId)

          return <li key={`${fromId}:${toId}`}>
            <div><span className="topic-code">{fromId}</span>{from?.topic_name ?? fromId}</div>
            <strong>{number.format(hours)} ч →</strong>
            <div><span className="topic-code">{toId}</span>{to?.topic_name ?? toId}</div>
            {!isManual && from && to && (
              <details className="transfer-evidence">
                <summary>Почему этот перенос?</summary>
                <dl>
                  <TransferEvidence item={from} threshold={plan.mastery_threshold} label="Резерв часов" />
                  <TransferEvidence item={to} threshold={plan.mastery_threshold} label="Сложная тема" />
                </dl>
              </details>
            )}
          </li>
        })}
      </ul>
    ) : <p className="sample-note">Переносов часов нет.</p>}
  </section>
}

import type { PlanData } from './data/curriculum'

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
    <dd className="transfer-reason">{item.reason}</dd>
  </div>
}

export default function PlanTransfers({ plan, isManual, featured = false }: { plan: PlanData; isManual: boolean; featured?: boolean }) {
  const items = new Map(plan.items.map(item => [item.topic_id, item]))
  const titleId = featured ? 'key-transfer-title' : 'transfers-title'
  function renderTransfer(transfer: PlanData['transfers'][number]) {
    const { from_topic_id: fromId, to_topic_id: toId, hours } = transfer
    const from = items.get(fromId)
    const to = items.get(toId)
    const route = <><span className="transfer-topic"><small>Тема-источник</small><span className="topic-code">{fromId}</span>{from?.topic_name ?? fromId}</span><strong>{number.format(hours)} ч →</strong><span className="transfer-topic"><small>Тема-получатель</small><span className="topic-code">{toId}</span>{to?.topic_name ?? toId}</span></>
    return <li key={`${fromId}:${toId}`}>
      {!isManual && from && to ? <details className="transfer-evidence"><summary className="transfer-route">{route}<span className="transfer-why">Почему этот перенос?<span aria-hidden="true">+</span></span></summary><dl><TransferEvidence item={from} threshold={plan.mastery_threshold} label="Резерв часов" /><TransferEvidence item={to} threshold={plan.mastery_threshold} label="Сложная тема" /></dl></details> : <div className="transfer-route">{route}</div>}
    </li>
  }

  return <section className={`plan-section ${featured ? 'featured-transfer' : ''}`} aria-labelledby={titleId}>
    <h2 id={titleId}>{featured ? plan.transfers.length ? 'Ключевой перенос' : 'Переносы не требуются' : 'Откуда и куда переносятся часы'}</h2>
    {isManual && <p className="transfer-note">Переносы показывают итоговую разницу между исходным планом и вашим вариантом. Последняя правка отмечена отдельно в сравнении планов.</p>}
    {plan.transfers.length > 0 ? <><ul className="transfer-list">{(featured ? plan.transfers.slice(0, 1) : plan.transfers).map(renderTransfer)}</ul>{featured && plan.transfers.length > 1 && <details className="other-transfers"><summary>Остальные переносы · {plan.transfers.length - 1}</summary><ul className="transfer-list">{plan.transfers.slice(1).map(renderTransfer)}</ul></details>}</> : <p className="sample-note">Переносов часов нет.</p>}
    {!isManual && (
      <details className="transfer-rules">
        <summary>Правила автоматического расчёта</summary>
        <p>
          Считаем долю результатов ниже {plan.mastery_threshold} баллов. Для каждой темы нужно минимум 20 результатов.
          Тема может отдать часы при доле до 10% включительно и получить часы при доле от 50%.
          Автоматический расчёт меняет часы темы максимум на 2 часа, соблюдает её минимум и максимум и сохраняет общий бюджет.
        </p>
      </details>
    )}
  </section>
}

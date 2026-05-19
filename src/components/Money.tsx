/** Amount with small OMR suffix (Omani Rial). */
export function Money({
  amount,
  className = "",
}: {
  amount: number;
  className?: string;
}) {
  return (
    <span className={`money ${className}`.trim()}>
      {amount.toFixed(3)}
      <span className="omr">OMR</span>
    </span>
  );
}

export function formatMoney(amount: number) {
  return `${amount.toFixed(3)} OMR`;
}

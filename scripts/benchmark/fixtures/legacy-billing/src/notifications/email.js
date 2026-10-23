const outbox = [];

export function formatMoney(cents) {
  return `R$ ${(cents / 100).toFixed(2).replace('.', ',')}`;
}

export function sendInvoiceEmail(invoice, customer) {
  outbox.push({
    to: customer.email,
    subject: `Sua fatura de ${invoice.issuedAt.slice(0, 10)}`,
    body: [
      `Olá, ${customer.name}. Cliente desde ${customer.contractSignedAt.slice(0, 4)}.`,
      ...invoice.lines.map((line) => `${line.sku} x${line.quantity}: ${formatMoney(line.totalCents)}`),
      `Desconto: ${formatMoney(invoice.discountCents)}`,
      `Total: ${formatMoney(invoice.totalCents)}`,
    ].join('\n'),
  });
}

export function sentEmails() {
  return outbox.map((message) => ({ ...message }));
}

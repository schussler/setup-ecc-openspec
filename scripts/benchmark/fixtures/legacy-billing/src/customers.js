const CUSTOMERS = [
  { id: 'c-100', name: 'Ana Souza', tier: 'regular', contractSignedAt: '2024-03-18', email: 'ana@example.com' },
  { id: 'c-200', name: 'Bruno Lima', tier: 'gold', contractSignedAt: '2021-07-02', email: 'bruno@example.com' },
  { id: 'c-300', name: 'Carla Dias', tier: 'regular', contractSignedAt: '2023-11-30', email: 'carla@example.com' },
  { id: 'c-400', name: 'Diego Rocha', tier: 'gold', contractSignedAt: '2025-01-09', email: 'diego@example.com' },
];

export function findCustomer(id) {
  const customer = CUSTOMERS.find((c) => c.id === id);
  if (!customer) throw new Error(`unknown customer ${id}`);
  return { ...customer };
}

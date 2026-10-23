const CUSTOMERS = [
  { id: 'c-100', name: 'Ana Souza', tier: 'regular', legacyContract: false, email: 'ana@example.com' },
  { id: 'c-200', name: 'Bruno Lima', tier: 'gold', legacyContract: true, email: 'bruno@example.com' },
  { id: 'c-300', name: 'Carla Dias', tier: 'regular', legacyContract: true, email: 'carla@example.com' },
  { id: 'c-400', name: 'Diego Rocha', tier: 'gold', legacyContract: false, email: 'diego@example.com' },
];

export function findCustomer(id) {
  const customer = CUSTOMERS.find((c) => c.id === id);
  if (!customer) throw new Error(`unknown customer ${id}`);
  return { ...customer };
}

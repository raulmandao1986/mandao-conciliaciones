// Supabase (PostgREST) devuelve como máximo 1000 filas por consulta: sin
// paginar, una conciliación Masiva de un mes con "Todas las Áreas" (más de
// 2000 órdenes) se calculaba en silencio con solo las primeras 1000.
// `build(from, to)` debe incluir un `.order(...)` estable para que las
// páginas no se solapen ni salten filas.
const PAGE_SIZE = 1000;

export async function fetchAllRows<T>(
  build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await build(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < PAGE_SIZE) return rows;
  }
}

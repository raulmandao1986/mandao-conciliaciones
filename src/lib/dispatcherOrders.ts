import { readRuleColumns } from './dispatcherRules';
import { normalizeSheetDateStr } from './sheetDateParser';

// Lectura de una fila de la pestaña "Orders" del Dispatcher y su conversión
// a fila de la tabla `dispatcher`. Compartido por Verificación (importa) y
// Revisión (compara y sincroniza): antes cada pantalla tenía su propio
// mapeo con valores por defecto y columnas distintas ("No asignado" vs "",
// "0" vs "" en Promocode, Transaction Fee guardado en `tax`...), así que la
// Revisión marcaba diferencias en órdenes recién importadas que en realidad
// coincidían con el Sheet.

export function parseCellNumber(val: any): number {
  if (val === undefined || val === null) return 0;
  if (typeof val === 'number') return val;
  let str = String(val).trim();
  if (str === '') return 0;

  // Remove currency symbols, spaces, percent signs
  str = str.replace(/[$€%\s]/g, '');

  if (str.includes(',') && str.includes('.')) {
    if (str.indexOf('.') < str.indexOf(',')) {
      // Spanish style: Dot is thousands separator, comma is decimal (e.g. 1.234,56 or 2.30,00)
      const parts = str.split(',');
      const integerPartWithDots = parts[0];
      const decimalPart = parts[1] || '';

      const segments = integerPartWithDots.split('.');
      let integerPart = segments[0] || '';
      for (let i = 1; i < segments.length; i++) {
        const seg = segments[i];
        if (i === segments.length - 1) {
          // Last segment before comma (e.g., "30" in "2.30"). Pad if needed to 3 digits
          if (seg.length < 3) {
            integerPart += seg.padEnd(3, '0');
          } else {
            integerPart += seg;
          }
        } else {
          integerPart += seg.padStart(3, '0');
        }
      }
      str = integerPart + '.' + decimalPart;
    } else {
      // English style: Comma is thousands separator, dot is decimal (e.g. 1,234.56)
      str = str.replace(/,/g, '');
    }
  } else if (str.includes(',')) {
    // Only comma exists (e.g. 425,00 or 1,234)
    const parts = str.split(',');
    const decimals = parts[parts.length - 1];

    // If the part after the last comma has 1 or 2 digits, it is a decimal separator.
    // Also when the integer part is 0 ("0,002", tasas como "Rate"): "0,002" no
    // puede ser un separador de miles.
    if (decimals.length === 1 || decimals.length === 2 || (parts.length === 2 && /^-?0?$/.test(parts[0]))) {
      str = parts.slice(0, -1).join('') + '.' + decimals;
    } else {
      // Otherwise it's thousands separator (e.g. 1,123)
      str = str.replace(/,/g, '');
    }
  }

  const n = parseFloat(str);
  return isNaN(n) ? 0 : n;
}

export function mapOrderRow(row: any[], headerMap: Record<string, number>, sheetRow?: number) {
  const getVal = (keys: string[]) => {
    for (const key of keys) {
      const idx = headerMap[key];
      if (idx !== undefined && idx < row.length) {
        return row[idx];
      }
    }
    return '';
  };

  const getNum = (keys: string[]) => parseCellNumber(getVal(keys));

  const orderId = getVal(['orderid', 'orden', 'noorden', 'id', 'numeroorden', 'norden']) || '';
  const negocio = getVal(['store', 'negocio', 'establecimiento', 'restaurante', 'comercio']) || 'N/A';
  const cliente = getVal(['customer', 'client', 'cliente']) || '';

  return {
    orden: orderId,
    orderId: orderId,
    id: orderId,
    sheetRow,
    deliveryDate: getVal(['deliverydate', 'fechadeentrega', 'fechaentrega', 'fecha', 'date']) || '',
    orderDate: getVal(['orderdate', 'fechadeorden', 'fechaorden']) || '',
    driver: getVal(['driver', 'mensajero', 'repartidor', 'conductor']) || 'No asignado',
    negocio,
    store: negocio,
    cliente,
    customer: cliente,
    customerNumber: getVal(['customernumber', 'numerodetelefono', 'telefono', 'telefonocliente', 'tel']) || '',
    monto: getNum(['monto', 'amount', 'total', 'montototal']),
    deliveryCharge: getNum(['deliverycharge', 'costodeentrega', 'cargoentrega', 'delivery']),
    extraDeliveryCharge: getNum(['extradeliverycharge', 'extradelivery', 'cargoextra', 'masdistancia']),
    driverAdminCharge: getNum(['driveradmincharge', 'driveradmin', 'comisionmensajero']),
    complementaryDelivery: getNum(['complementarydelivery', 'complementario', 'entregaenlacasilla']),
    productAmount: getNum(['productamount', 'montoproducto', 'montoarticulos', 'articulos', 'products']),
    storeOffer: getNum(['storeoffer', 'ofertaestablecimiento', 'ofertatienda', 'descuento']),
    storeAdminCharge: getNum(['storeadmincharge', 'storeadmin', 'comisioncomercio', 'comisiontienda']),
    processingFee: getNum(['processingfee', 'cargoprocesamiento', 'procesamiento', 'fee']),
    // Columnas propias y separadas (2026-10-07): antes "Transaction Fee" se
    // leía con fallback a "Tax" y se guardaba en `tax`, y "Rate" no se leía.
    tax: getNum(['tax', 'impuesto', 'iva']),
    rate: getNum(['rate', 'tasa', 'tasadecambio']),
    transactionFee: getNum(['transactionfee', 'comisiontransaccion']),
    promocode: getVal(['promocode', 'codigopromocional', 'promo', 'cupon']) || '0',
    paymentType: getVal(['viapago', 'paymenttype', 'metododepago', 'formadepago', 'tipopago']) || 'Efectivo',
    tipoOrden: getVal(['tipoorden', 'ordertype', 'tipoorden']) || 'Regular',
    area: getVal(['area', 'zona', 'provincia', 'demarcacion']) || 'Habana',

    // Raw cell strings for strict empty/dash verification
    productAmountRaw: getVal(['productamount', 'montoproducto', 'montoarticulos', 'articulos', 'products']),
    storeOfferRaw: getVal(['storeoffer', 'ofertaestablecimiento', 'ofertatienda', 'descuento']),
    storeAdminChargeRaw: getVal(['storeadmincharge', 'storeadmin', 'comisioncomercio', 'comisiontienda']),
    deliveryChargeRaw: getVal(['deliverycharge', 'costodeentrega', 'cargoentrega', 'delivery']),
    extraDeliveryChargeRaw: getVal(['extradeliverycharge', 'extradelivery', 'cargoextra', 'masdistancia']),
    driverAdminChargeRaw: getVal(['driveradmincharge', 'driveradmin', 'comisionmensajero']),
    complementaryDeliveryRaw: getVal(['complementarydelivery', 'complementario', 'entregaenlacasilla']),
    // Valor crudo de cada columna exceptuable por Reglas (Configuración -> Reglas)
    ruleRaw: readRuleColumns(row, headerMap)
  };
}

export type SheetOrder = ReturnType<typeof mapOrderRow>;

// Fila de `dispatcher` a partir de una orden del Sheet (importación de la
// Verificación y "crear en BD" de la Revisión usan exactamente lo mismo).
export function orderToDbRow(o: SheetOrder, areaId: string | null, verificationId?: string) {
  return {
    delivery_date: normalizeSheetDateStr(o.deliveryDate) || null,
    order_date: normalizeSheetDateStr(o.orderDate) || null,
    payment_type: o.paymentType,
    customer: o.cliente,
    customer_number: o.customerNumber,
    driver: o.driver,
    store: o.negocio,
    order_id: o.orderId,
    product_amount: o.productAmount,
    store_offer: o.storeOffer,
    processing_fee: o.processingFee,
    store_admin_charge: o.storeAdminCharge,
    delivery_charge: o.deliveryCharge,
    extra_delivery_charge: o.extraDeliveryCharge,
    driver_admin_charge: o.driverAdminCharge,
    complementary_delivery: String(o.complementaryDelivery ?? ''),
    tax: o.tax,
    rate: o.rate,
    transaction_fee: o.transactionFee,
    promocode: o.promocode,
    area_id: areaId,
    ...(verificationId ? { verification_id: verificationId } : {}),
  };
}

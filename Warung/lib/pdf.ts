import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { rupiah, formatTanggalWaktu } from '@/lib/format';
import type { SaleRow } from '@/lib/types';

export function exportSalesToPdf(rows: SaleRow[], meta: { from?: string; to?: string; namaWarung: string }) {
  const doc = new jsPDF();

  doc.setFontSize(14);
  doc.text(`Laporan Penjualan - ${meta.namaWarung}`, 14, 15);
  doc.setFontSize(9);
  doc.setTextColor(110, 110, 110);
  const periode = meta.from || meta.to ? `Periode: ${meta.from || 'awal'} s/d ${meta.to || 'sekarang'}` : 'Periode: semua data';
  doc.text(periode, 14, 21);
  doc.text(`Dicetak: ${new Date().toLocaleString('id-ID')}`, 14, 26);

  autoTable(doc, {
    startY: 31,
    head: [['No', 'Tanggal', 'Produk', 'Pembeli', 'Qty', 'Harga', 'Total']],
    body: rows.map((r, i) => [
      i + 1,
      formatTanggalWaktu(r.sold_at),
      r.product_name_snapshot,
      r.buyer_name || '-',
      r.qty,
      rupiah(r.unit_price),
      rupiah(r.total),
    ]),
    styles: { fontSize: 8, cellPadding: 2.5 },
    headStyles: { fillColor: [245, 129, 63], textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [250, 247, 255] },
    columnStyles: { 0: { cellWidth: 10 }, 4: { halign: 'right' }, 5: { halign: 'right' }, 6: { halign: 'right' } },
  });

  const total = rows.reduce((s, r) => s + r.total, 0);
  const totalQty = rows.reduce((s, r) => s + r.qty, 0);
  const finalY = (doc as any).lastAutoTable?.finalY || 40;

  doc.setFontSize(10);
  doc.setTextColor(46, 42, 61);
  doc.text(`Total Qty: ${totalQty.toLocaleString('id-ID')}`, 14, finalY + 9);
  doc.setFont('helvetica', 'bold');
  doc.text(`Total Omzet: ${rupiah(total)}`, 14, finalY + 15);

  doc.save(`riwayat-penjualan-${new Date().toISOString().slice(0, 10)}.pdf`);
}

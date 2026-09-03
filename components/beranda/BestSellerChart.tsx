'use client';

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { rupiah } from '@/lib/format';

const COLORS = ['#FF9D5C', '#A78CE8', '#63C89C', '#54BAF5', '#FB7797', '#FFC933', '#F5813F', '#8C6DDB'];

export function BestSellerChart({ data }: { data: { product_name: string; omzet: number }[] }) {
  const chartData = data.map((d) => ({ name: d.product_name.length > 16 ? d.product_name.slice(0, 15) + '…' : d.product_name, omzet: d.omzet }));
  return (
    <ResponsiveContainer width="100%" height={Math.max(200, chartData.length * 34)}>
      <BarChart data={chartData} layout="vertical" margin={{ top: 4, right: 16, left: 4, bottom: 4 }}>
        <XAxis type="number" hide />
        <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 11, fill: '#2E2A3D' }} axisLine={false} tickLine={false} />
        <Tooltip formatter={(v: number) => rupiah(v)} contentStyle={{ borderRadius: 12, border: '1px solid #EDE7FC', fontSize: 12 }} />
        <Bar dataKey="omzet" radius={[0, 8, 8, 0]} barSize={18}>
          {chartData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

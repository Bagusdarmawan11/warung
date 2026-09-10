'use client';

import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { rupiah } from '@/lib/format';

export function TrendChart({ data }: { data: { label: string; omzet: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={180}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="omzetGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#FF9D5C" stopOpacity={0.45} />
            <stop offset="100%" stopColor="#FF9D5C" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="4 6" stroke="#EDE7FC" vertical={false} />
        <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#726C8A' }} axisLine={false} tickLine={false} />
        <YAxis hide />
        <Tooltip
          formatter={(v: number) => rupiah(v)}
          contentStyle={{ borderRadius: 12, border: '1px solid #EDE7FC', fontSize: 12 }}
        />
        <Area type="monotone" dataKey="omzet" stroke="#F5813F" strokeWidth={2.5} fill="url(#omzetGradient)" />
      </AreaChart>
    </ResponsiveContainer>
  );
}

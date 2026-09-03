'use client';

import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell } from 'recharts';
import { rupiah } from '@/lib/format';

const BAR_COLORS = ['#FF9D5C', '#A78CE8', '#63C89C', '#54BAF5', '#FB7797', '#FFC933'];

export function TrendChartToggle({ data, type }: { data: { label: string; omzet: number }[]; type: 'line' | 'bar' }) {
  if (type === 'bar') {
    return (
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="4 6" stroke="#EDE7FC" vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#726C8A' }} axisLine={false} tickLine={false} />
          <YAxis hide />
          <Tooltip formatter={(v: number) => rupiah(v)} contentStyle={{ borderRadius: 12, border: '1px solid #EDE7FC', fontSize: 12 }} cursor={{ fill: 'rgba(167,140,232,0.08)' }} />
          <Bar dataKey="omzet" radius={[8, 8, 0, 0]}>
            {data.map((_, i) => <Cell key={i} fill={BAR_COLORS[i % BAR_COLORS.length]} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={220}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="omzetGradient2" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#FF9D5C" stopOpacity={0.5} />
            <stop offset="100%" stopColor="#A78CE8" stopOpacity={0.03} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="4 6" stroke="#EDE7FC" vertical={false} />
        <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#726C8A' }} axisLine={false} tickLine={false} />
        <YAxis hide />
        <Tooltip formatter={(v: number) => rupiah(v)} contentStyle={{ borderRadius: 12, border: '1px solid #EDE7FC', fontSize: 12 }} />
        <Area type="monotone" dataKey="omzet" stroke="#F5813F" strokeWidth={2.5} fill="url(#omzetGradient2)" />
      </AreaChart>
    </ResponsiveContainer>
  );
}

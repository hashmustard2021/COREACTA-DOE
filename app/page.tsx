"use client";

import {
  Area,
  AreaChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  ArrowDownRight,
  ArrowUpRight,
  PackageCheck,
  RefreshCcw,
  ShoppingBag,
  Users,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

const salesData = [
  { date: "4/06", sales: 42800000 },
  { date: "4/07", sales: 39100000 },
  { date: "4/08", sales: 44700000 },
  { date: "4/09", sales: 47300000 },
  { date: "4/10", sales: 51200000 },
  { date: "4/11", sales: 49800000 },
  { date: "4/12", sales: 53600000 },
  { date: "4/13", sales: 58400000 },
  { date: "4/14", sales: 55200000 },
  { date: "4/15", sales: 61900000 },
  { date: "4/16", sales: 64200000 },
  { date: "4/17", sales: 60800000 },
  { date: "4/18", sales: 67100000 },
  { date: "4/19", sales: 70300000 },
  { date: "4/20", sales: 68200000 },
  { date: "4/21", sales: 72900000 },
  { date: "4/22", sales: 75400000 },
  { date: "4/23", sales: 71300000 },
  { date: "4/24", sales: 78700000 },
  { date: "4/25", sales: 82100000 },
  { date: "4/26", sales: 79800000 },
  { date: "4/27", sales: 84600000 },
  { date: "4/28", sales: 88200000 },
  { date: "4/29", sales: 85700000 },
  { date: "4/30", sales: 91300000 },
  { date: "5/01", sales: 94800000 },
  { date: "5/02", sales: 97600000 },
  { date: "5/03", sales: 94200000 },
  { date: "5/04", sales: 100800000 },
  { date: "5/05", sales: 106300000 },
];

const categoryData = [
  { name: "패션", value: 34, amount: 361400000, color: "#22d3ee" },
  { name: "뷰티", value: 22, amount: 233800000, color: "#a78bfa" },
  { name: "식품", value: 18, amount: 191300000, color: "#34d399" },
  { name: "가전", value: 15, amount: 159500000, color: "#f59e0b" },
  { name: "생활", value: 11, amount: 116900000, color: "#fb7185" },
];

const recentOrders = [
  { id: "ORD-20260505-1048", customer: "김서연", amount: 189000, status: "배송중" },
  { id: "ORD-20260505-1047", customer: "박준호", amount: 73400, status: "결제완료" },
  { id: "ORD-20260505-1046", customer: "이민지", amount: 421000, status: "출고완료" },
  { id: "ORD-20260505-1045", customer: "최현우", amount: 128500, status: "교환요청" },
  { id: "ORD-20260505-1044", customer: "정다은", amount: 56200, status: "배송완료" },
  { id: "ORD-20260505-1043", customer: "한지훈", amount: 268900, status: "결제완료" },
];

const metrics = [
  {
    label: "총 매출",
    value: "₩106.3M",
    delta: "+12.4%",
    trend: "up",
    icon: ShoppingBag,
  },
  {
    label: "주문 수",
    value: "3,482건",
    delta: "+8.7%",
    trend: "up",
    icon: PackageCheck,
  },
  {
    label: "신규 회원",
    value: "612명",
    delta: "+5.1%",
    trend: "up",
    icon: Users,
  },
  {
    label: "반품률",
    value: "2.8%",
    delta: "-0.6%",
    trend: "down",
    icon: RefreshCcw,
  },
];

const statusTone: Record<string, string> = {
  배송중: "status-blue",
  결제완료: "status-green",
  출고완료: "status-cyan",
  교환요청: "status-amber",
  배송완료: "status-slate",
};

function formatWon(value: number) {
  if (value >= 100000000) return `${(value / 100000000).toFixed(1)}억`;
  return `${Math.round(value / 10000).toLocaleString("ko-KR")}만`;
}

function AnimatedVisitors() {
  const [visitors, setVisitors] = useState(1284);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setVisitors((current) => current + Math.floor(Math.random() * 8) + 2);
    }, 1300);

    return () => window.clearInterval(timer);
  }, []);

  const pulses = useMemo(() => Array.from({ length: 18 }, (_, index) => index), []);

  return (
    <section className="panel visitors-panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Live Traffic</p>
          <h2>실시간 접속자 수</h2>
        </div>
        <span className="live-dot">LIVE</span>
      </div>
      <div className="visitor-stage" aria-label="실시간 접속자 수">
        {pulses.map((item) => (
          <span key={item} className="pulse" style={{ "--i": item } as React.CSSProperties} />
        ))}
        <strong>{visitors.toLocaleString("ko-KR")}</strong>
        <p>현재 쇼핑몰 탐색 중</p>
      </div>
      <div className="visitor-meta">
        <span>모바일 73%</span>
        <span>앱 유입 41%</span>
        <span>평균 체류 4분 18초</span>
      </div>
    </section>
  );
}

export default function Dashboard() {
  return (
    <main className="dashboard">
      <header className="topbar">
        <div>
          <p className="eyebrow">2026년 5월 5일 화요일</p>
          <h1>이커머스 관리자 대시보드</h1>
        </div>
        <div className="topbar-actions">
          <button type="button">오늘</button>
          <button type="button">CSV 내보내기</button>
        </div>
      </header>

      <section className="metrics-grid" aria-label="오늘의 핵심 지표">
        {metrics.map((metric) => {
          const Icon = metric.icon;
          const TrendIcon = metric.trend === "up" ? ArrowUpRight : ArrowDownRight;
          return (
            <article key={metric.label} className="metric-card">
              <div className="metric-icon">
                <Icon size={20} />
              </div>
              <div>
                <p>{metric.label}</p>
                <strong>{metric.value}</strong>
              </div>
              <span className={metric.trend === "up" ? "delta up" : "delta down"}>
                <TrendIcon size={15} />
                {metric.delta}
              </span>
            </article>
          );
        })}
      </section>

      <section className="content-grid">
        <article className="panel sales-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Revenue</p>
              <h2>최근 30일 매출 추이</h2>
            </div>
            <span className="panel-note">전월 동기 대비 +18.2%</span>
          </div>
          <div className="chart-wrap">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={salesData} margin={{ top: 12, right: 12, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="salesGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#22d3ee" stopOpacity={0.48} />
                    <stop offset="100%" stopColor="#22d3ee" stopOpacity={0.03} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="date" tickLine={false} axisLine={false} minTickGap={24} />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={formatWon}
                  width={54}
                />
                <Tooltip
                  contentStyle={{
                    background: "#101725",
                    border: "1px solid #263142",
                    borderRadius: 8,
                    color: "#e5edf7",
                  }}
                  formatter={(value) => [`₩${Number(value).toLocaleString("ko-KR")}`, "매출"]}
                />
                <Area
                  type="monotone"
                  dataKey="sales"
                  stroke="#22d3ee"
                  strokeWidth={3}
                  fill="url(#salesGradient)"
                  activeDot={{ r: 5, strokeWidth: 0, fill: "#a7f3d0" }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </article>

        <article className="panel category-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Category Mix</p>
              <h2>카테고리별 매출 비중</h2>
            </div>
          </div>
          <div className="donut-layout">
            <ResponsiveContainer width="100%" height={230}>
              <PieChart>
                <Pie
                  data={categoryData}
                  innerRadius={68}
                  outerRadius={98}
                  paddingAngle={4}
                  dataKey="value"
                  nameKey="name"
                >
                  {categoryData.map((entry) => (
                    <Cell key={entry.name} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    background: "#101725",
                    border: "1px solid #263142",
                    borderRadius: 8,
                    color: "#e5edf7",
                  }}
                  formatter={(value, name) => [`${value}%`, name]}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="category-list">
              {categoryData.map((item) => (
                <div key={item.name} className="category-item">
                  <span className="swatch" style={{ background: item.color }} />
                  <span>{item.name}</span>
                  <strong>{item.value}%</strong>
                </div>
              ))}
            </div>
          </div>
        </article>
      </section>

      <section className="content-grid bottom-grid">
        <article className="panel orders-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Orders</p>
              <h2>최근 주문 목록</h2>
            </div>
            <span className="panel-note">최근 15분 기준</span>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>주문번호</th>
                  <th>고객명</th>
                  <th>금액</th>
                  <th>상태</th>
                </tr>
              </thead>
              <tbody>
                {recentOrders.map((order) => (
                  <tr key={order.id}>
                    <td>{order.id}</td>
                    <td>{order.customer}</td>
                    <td>₩{order.amount.toLocaleString("ko-KR")}</td>
                    <td>
                      <span className={`status ${statusTone[order.status]}`}>{order.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>

        <AnimatedVisitors />
      </section>
    </main>
  );
}

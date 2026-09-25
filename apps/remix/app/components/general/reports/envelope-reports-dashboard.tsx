import { Card, CardContent, CardHeader, CardTitle } from '@documenso/ui/primitives/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@documenso/ui/primitives/select';
import { Tabs, TabsList, TabsTrigger } from '@documenso/ui/primitives/tabs';
import { useSearchParams } from 'react-router';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

type ReportData = {
  teams: Array<{ id: number; name: string; url: string }>;
  canViewOrganisation: boolean;
  selectedTeamId: number | null;
  range: '7d' | '30d' | '90d' | '365d' | 'calendar-year';
  calendarYear: number;
  bucket: 'day' | 'week' | 'month';
  metrics: {
    total: number;
    completed: number;
    inProgress: number;
    rejected: number;
    activeSenders: number;
    completionRate: number;
    averageTurnaroundHours: number;
  };
  chartData: Array<{ label: string; DRAFT: number; PENDING: number; COMPLETED: number; REJECTED: number }>;
  topSenders: Array<{
    id: number;
    name: string;
    count: number;
    completed: number;
    inProgress: number;
    rejected: number;
  }>;
  turnaroundDistribution: Array<{ label: string; count: number }>;
  slowestEnvelopes: Array<{ title: string; ageInDays: number }>;
  templateEffectiveness: Array<{ name: string; count: number; completionRate: number }>;
};

export const EnvelopeReportsDashboard = ({ report }: { report: ReportData }) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const updateFilter = (key: string, value: string) => {
    const next = new URLSearchParams(searchParams);
    if (value === 'all') {
      next.delete(key);
    } else {
      next.set(key, value);
    }
    setSearchParams(next);
  };
  const averageTurnaround =
    report.metrics.averageTurnaroundHours >= 48
      ? `${(report.metrics.averageTurnaroundHours / 24).toFixed(1)} days`
      : `${Math.round(report.metrics.averageTurnaroundHours)} hours`;
  const calendarYears = Array.from({ length: new Date().getUTCFullYear() - 2000 + 1 }, (_, index) =>
    (new Date().getUTCFullYear() - index).toString(),
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
        <Tabs value={report.range} onValueChange={(value) => updateFilter('range', value)}>
          <TabsList>
            <TabsTrigger value="7d">7 days</TabsTrigger>
            <TabsTrigger value="30d">30 days</TabsTrigger>
            <TabsTrigger value="90d">90 days</TabsTrigger>
            <TabsTrigger value="365d">1 year</TabsTrigger>
            <TabsTrigger value="calendar-year">Calendar year</TabsTrigger>
          </TabsList>
        </Tabs>
        <Select value={report.bucket} onValueChange={(value) => updateFilter('bucket', value)}>
          <SelectTrigger className="w-full lg:w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="day">Daily</SelectItem>
            <SelectItem value="week">Weekly</SelectItem>
            <SelectItem value="month">Monthly</SelectItem>
          </SelectContent>
        </Select>
        {report.range === 'calendar-year' && (
          <Select value={report.calendarYear.toString()} onValueChange={(value) => updateFilter('year', value)}>
            <SelectTrigger className="w-full lg:w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {calendarYears.map((year) => (
                <SelectItem value={year} key={year}>
                  {year}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {report.canViewOrganisation && (
          <Select
            value={report.selectedTeamId?.toString() ?? 'all'}
            onValueChange={(value) => updateFilter('teamId', value)}
          >
            <SelectTrigger className="w-full lg:w-52">
              <SelectValue placeholder="All teams" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All teams</SelectItem>
              {report.teams.map((team) => (
                <SelectItem value={team.id.toString()} key={team.id}>
                  {team.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <Metric title="Envelopes created" value={report.metrics.total.toLocaleString()} />
        <Metric
          title="Completion rate"
          value={`${report.metrics.completionRate}%`}
          detail={`${report.metrics.completed} completed`}
        />
        <Metric
          title="In progress"
          value={report.metrics.inProgress.toLocaleString()}
          detail={`${report.metrics.rejected} declined`}
        />
        <Metric title="Average turnaround" value={averageTurnaround} detail="Completed envelopes" />
        <Metric
          title="Active senders"
          value={report.metrics.activeSenders.toLocaleString()}
          detail="Created an envelope"
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Envelope usage</CardTitle>
          <p className="text-muted-foreground text-sm">Created envelopes by status over time.</p>
        </CardHeader>
        <CardContent className="h-[340px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={report.chartData} barGap={2}>
              <CartesianGrid vertical={false} strokeDasharray="3 3" />
              <XAxis dataKey="label" tickLine={false} axisLine={false} />
              <YAxis allowDecimals={false} tickLine={false} axisLine={false} />
              <Tooltip />
              <Legend />
              <Bar dataKey="COMPLETED" name="Completed" stackId="status" fill="hsl(var(--primary))" />
              <Bar dataKey="PENDING" name="In progress" stackId="status" fill="#8b5cf6" />
              <Bar dataKey="REJECTED" name="Declined" stackId="status" fill="#f97316" />
              <Bar dataKey="DRAFT" name="Draft" stackId="status" fill="#94a3b8" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Time to complete</CardTitle>
            <p className="text-muted-foreground text-sm">
              How long completed envelopes take from creation to completion.
            </p>
          </CardHeader>
          <CardContent className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={report.turnaroundDistribution}>
                <CartesianGrid vertical={false} strokeDasharray="3 3" />
                <XAxis dataKey="label" tickLine={false} axisLine={false} />
                <YAxis allowDecimals={false} tickLine={false} axisLine={false} />
                <Tooltip />
                <Bar dataKey="count" name="Completed envelopes" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle>Completion trend</CardTitle>
            <p className="text-muted-foreground text-sm">Completed envelopes compared with work still in progress.</p>
          </CardHeader>
          <CardContent className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={report.chartData}>
                <CartesianGrid vertical={false} strokeDasharray="3 3" />
                <XAxis dataKey="label" tickLine={false} axisLine={false} />
                <YAxis allowDecimals={false} tickLine={false} axisLine={false} />
                <Tooltip />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="COMPLETED"
                  name="Completed"
                  stroke="hsl(var(--primary))"
                  strokeWidth={2}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="PENDING"
                  name="In progress"
                  stroke="#8b5cf6"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Most active senders</CardTitle>
            <p className="text-muted-foreground text-sm">By envelopes created.</p>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {report.topSenders.length === 0 ? (
                <p className="text-muted-foreground text-sm">No envelopes in this period.</p>
              ) : (
                report.topSenders.map((sender, index) => (
                  <div className="flex items-center justify-between" key={sender.id}>
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted font-medium text-xs">
                        {index + 1}
                      </span>
                      <span className="truncate text-sm">{sender.name}</span>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-sm">{sender.count}</p>
                      <p className="text-muted-foreground text-xs">
                        {sender.count === 0 ? '0%' : `${Math.round((sender.completed / sender.count) * 100)}%`}{' '}
                        completed
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Top users by envelope activity</CardTitle>
          <p className="text-muted-foreground text-sm">Who is creating the most envelopes, broken down by outcome.</p>
        </CardHeader>
        <CardContent className="h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={[...report.topSenders].reverse()} layout="vertical" barGap={2}>
              <CartesianGrid horizontal={false} strokeDasharray="3 3" />
              <XAxis type="number" allowDecimals={false} tickLine={false} axisLine={false} />
              <YAxis
                dataKey="name"
                type="category"
                width={130}
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 12 }}
              />
              <Tooltip />
              <Legend />
              <Bar dataKey="completed" name="Completed" stackId="status" fill="hsl(var(--primary))" />
              <Bar dataKey="inProgress" name="In progress" stackId="status" fill="#8b5cf6" />
              <Bar dataKey="rejected" name="Declined" stackId="status" fill="#f97316" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Template effectiveness</CardTitle>
            <p className="text-muted-foreground text-sm">Most-used templates and their completion rates.</p>
          </CardHeader>
          <CardContent className="h-[280px]">
            {report.templateEffectiveness.length === 0 ? (
              <p className="text-muted-foreground text-sm">No envelopes in this period.</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={[...report.templateEffectiveness].reverse()} layout="vertical">
                  <CartesianGrid horizontal={false} strokeDasharray="3 3" />
                  <XAxis
                    type="number"
                    domain={[0, 100]}
                    tickFormatter={(value) => `${value}%`}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    dataKey="name"
                    type="category"
                    width={140}
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 12 }}
                  />
                  <Tooltip formatter={(value) => `${value}%`} />
                  <Bar
                    dataKey="completionRate"
                    name="Completion rate"
                    fill="hsl(var(--primary))"
                    radius={[0, 4, 4, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Needs attention</CardTitle>
            <p className="text-muted-foreground text-sm">Oldest envelopes that are still in progress.</p>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {report.slowestEnvelopes.length === 0 ? (
                <p className="text-muted-foreground text-sm">No in-progress envelopes need attention.</p>
              ) : (
                report.slowestEnvelopes.map((envelope) => (
                  <div
                    className="flex items-center justify-between gap-4"
                    key={`${envelope.title}-${envelope.ageInDays}`}
                  >
                    <span className="min-w-0 truncate text-sm">{envelope.title}</span>
                    <span className="shrink-0 rounded-full bg-orange-100 px-2 py-1 font-medium text-orange-700 text-xs dark:bg-orange-950 dark:text-orange-300">
                      {envelope.ageInDays}d open
                    </span>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

const Metric = ({ title, value, detail }: { title: string; value: string; detail?: string }) => (
  <Card>
    <CardContent className="p-5">
      <p className="text-muted-foreground text-sm">{title}</p>
      <p className="mt-1 font-semibold text-3xl tracking-tight">{value}</p>
      {detail && <p className="mt-1 text-muted-foreground text-xs">{detail}</p>}
    </CardContent>
  </Card>
);

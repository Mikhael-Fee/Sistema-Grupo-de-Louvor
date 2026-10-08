import { useId, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarDays, ChartNoAxesCombined, Music2, Tags, Users } from 'lucide-react';
import { EmptyState, FormError, PageHeader } from '../components/ui';
import { useMinistry } from '../context/MinistryContext';
import { analyticsDateRange, analyticsRangeError, buildMinistryAnalytics, ministryToday, type AnalyticsCount, type AnalyticsPeriod, type AnalyticsTimeline } from '../lib/analytics';
import './analytics.css';

const number = (value: number) => value.toLocaleString('pt-BR', { maximumFractionDigits: 1 });
const dateLabel = (value: string) => value ? value.split('-').reverse().join('/') : '';
const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR');
type TimelineMetric = 'services' | 'participations' | 'songUses';
const metricLabels: Record<TimelineMetric, string> = { services: 'Cultos', participations: 'Participações na escala', songUses: 'Músicas nos repertórios' };

function BarList<T extends AnalyticsCount>({ rows, percentageLabel, empty, detail, destination }: {
  rows: T[]; percentageLabel: string; empty: string;
  detail?: (row: T) => string; destination?: (row: T) => string | undefined;
}) {
  if (!rows.length) return <p className="analytics-empty">{empty}</p>;
  return <ol className="analytics-bars">{rows.map(row => {
    const target = destination?.(row);
    const description = detail?.(row);
    return <li key={row.id}><div className="analytics-bar-heading"><div>{target ? <Link to={target}>{row.label}</Link> : <strong>{row.label}</strong>}{description && <small>{description}</small>}</div><span><b>{number(row.count)}</b><small>{row.percentage}% {percentageLabel}</small></span></div><div className="analytics-bar-track" aria-hidden="true"><span style={{ width: `${Math.min(row.percentage, 100)}%` }} /></div></li>;
  })}</ol>;
}

function EvolutionChart({ points, metric, grouping }: { points: AnalyticsTimeline[]; metric: TimelineMetric; grouping: string }) {
  const titleId = useId();
  const descriptionId = useId();
  const maximum = Math.max(1, ...points.map(point => point[metric]));
  const width = 720;
  const height = 250;
  const left = 34;
  const top = 16;
  const graphHeight = 185;
  const graphWidth = width - left - 18;
  const step = points.length ? graphWidth / points.length : graphWidth;
  const labelStep = Math.max(1, Math.ceil(points.length / 6));
  if (!points.length) return <p className="analytics-empty">Nenhum culto neste período para montar o gráfico.</p>;
  return <figure className="analytics-evolution">
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-labelledby={`${titleId} ${descriptionId}`}>
      <title id={titleId}>{metricLabels[metric]} ao longo do tempo</title>
      <desc id={descriptionId}>{grouping}. {points.map(point => `${point.label}: ${number(point[metric])}`).join('; ')}. Os valores completos também estão na tabela abaixo.</desc>
      {[...new Set([0, Math.ceil(maximum / 2), maximum])].map(value => <g key={value}><line x1={left} x2={width - 18} y1={top + graphHeight * (1 - value / maximum)} y2={top + graphHeight * (1 - value / maximum)} className="analytics-gridline" /><text x={left - 7} y={top + graphHeight * (1 - value / maximum) + 4} textAnchor="end" className="analytics-axis-label">{number(value)}</text></g>)}
      {points.map((point, index) => {
        const barHeight = point[metric] / maximum * graphHeight;
        return <g key={point.id}><rect x={left + index * step + step * 0.18} y={top + graphHeight - barHeight} width={Math.max(2, step * 0.64)} height={barHeight} rx={Math.min(5, step * 0.1)} className="analytics-evolution-bar"><title>{point.label}: {number(point[metric])} {metricLabels[metric].toLocaleLowerCase('pt-BR')}</title></rect>{points.length <= 12 && point[metric] > 0 && <text x={left + (index + 0.5) * step} y={top + graphHeight - barHeight - 7} textAnchor="middle" className="analytics-value-label">{number(point[metric])}</text>}{(index % labelStep === 0 || index === points.length - 1) && <text x={left + (index + 0.5) * step} y={top + graphHeight + 25} textAnchor="middle" className="analytics-axis-label">{point.label}</text>}</g>;
      })}
    </svg>
    <figcaption>{grouping}. Intervalos sem cultos aparecem com zero.</figcaption>
    <details className="analytics-data-table"><summary>Ver números do gráfico</summary><table><caption>Planejamento por período</caption><thead><tr><th scope="col">Período</th><th scope="col">Cultos</th><th scope="col">Na escala</th><th scope="col">Músicas</th></tr></thead><tbody>{points.map(point => <tr key={point.id}><th scope="row">{point.label}</th><td>{number(point.services)}</td><td>{number(point.participations)}</td><td>{number(point.songUses)}</td></tr>)}</tbody></table></details>
  </figure>;
}

export default function AnalyticsPage() {
  const { data, mode, profile, error } = useMinistry();
  const [period, setPeriod] = useState<AnalyticsPeriod>('all');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [metric, setMetric] = useState<TimelineMetric>('services');
  const [theme, setTheme] = useState('');
  const [songSearch, setSongSearch] = useState('');
  const [personSearch, setPersonSearch] = useState('');
  const [limit, setLimit] = useState('10');
  const today = ministryToday();
  const range = analyticsDateRange(period, today, { start, end });
  const rangeError = analyticsRangeError(range);
  const themes = useMemo(() => [...new Set(data.services.map(service => service.type))].sort((a, b) => a.localeCompare(b, 'pt-BR')), [data.services]);
  const knownSongs = useMemo(() => new Set(data.songs.map(song => song.id)), [data.songs]);
  const report = useMemo(() => rangeError ? null : buildMinistryAnalytics({ ...data, services: theme ? data.services.filter(service => service.type === theme) : data.services }, range, today), [data, theme, range.start, range.end, rangeError, today]);
  const songQuery = normalize(songSearch.trim());
  const personQuery = normalize(personSearch.trim());
  const songs = report?.songs.filter(song => !songQuery || normalize(`${song.label} ${song.artist}`).includes(songQuery)) || [];
  const people = report?.people.filter(person => !personQuery || normalize(`${person.label} ${person.functions.join(' ')}`).includes(personQuery)) || [];
  const shown = Number(limit) || Infinity;
  if (!profile?.approved) return <EmptyState title="Entre para consultar os gráficos" description="Os gráficos acompanham os cultos disponíveis no seu acesso." />;
  return <div className="analytics-page">
    <PageHeader eyebrow="ACOMPANHAMENTO" title="Gráficos" description="Veja como os cultos, a equipe e os repertórios estão sendo planejados." />
    <p className="analytics-explanation">Os números vêm dos cultos e das escalas cadastrados. Uma participação indica que a pessoa foi escalada para um culto; não confirma presença.{mode === 'public' && ' Você está consultando os mesmos dados públicos do ministério.'}</p>
    <section className="card analytics-filters" aria-label="Filtros das análises">
      <label className="field"><span>Período</span><select aria-label="Período das análises" value={period} onChange={event => setPeriod(event.target.value as AnalyticsPeriod)}><option value="all">Todos os cultos</option><option value="30">Últimos 30 dias</option><option value="90">Últimos 90 dias</option><option value="year">Este ano, até hoje</option><option value="custom">Escolher datas</option></select></label>
      <label className="field"><span>Tipo de culto</span><select aria-label="Filtrar gráficos por tipo de culto" value={theme} onChange={event => setTheme(event.target.value)}><option value="">Todos os tipos</option>{theme && !themes.includes(theme) && <option value={theme}>{theme}</option>}{themes.map(value => <option key={value} value={value}>{value}</option>)}</select></label>
      {period === 'custom' && <><label className="field"><span>De <small>(opcional)</small></span><input type="date" aria-label="Data inicial das análises" value={start} onChange={event => setStart(event.target.value)} /></label><label className="field"><span>Até <small>(opcional)</small></span><input type="date" aria-label="Data final das análises" value={end} onChange={event => setEnd(event.target.value)} /></label></>}
      <p className="analytics-period-description" role="status">{range.start || range.end ? `${range.start ? `Desde ${dateLabel(range.start)}` : 'Desde o primeiro culto'} · ${range.end ? `até ${dateLabel(range.end)}` : 'sem data final'}` : 'Histórico completo, incluindo cultos programados.'}</p>
    </section>
    <FormError error={rangeError || error} />
    {report && <>
      <section className="analytics-stat-grid" aria-label="Resumo das análises">
        <div className="card analytics-stat"><CalendarDays size={22} /><strong>{number(report.services)}</strong><span>Cultos no período</span><small>{number(report.futureServices)} com data após hoje</small></div>
        <div className="card analytics-stat"><Users size={22} /><strong>{number(report.participations)}</strong><span>Participações na escala</span><small>{number(report.uniquePeople)} pessoas diferentes</small></div>
        <div className="card analytics-stat"><Music2 size={22} /><strong>{number(report.songUses)}</strong><span>Músicas nos repertórios</span><small>{number(report.uniqueSongs)} músicas diferentes</small></div>
        <div className="card analytics-stat"><ChartNoAxesCombined size={22} /><strong>{number(report.averageTeam)}</strong><span>Pessoas por culto, em média</span><small>Uma pessoa conta uma vez por culto</small></div>
      </section>
      {!report.services && <div className="card analytics-no-services"><EmptyState title="Nenhum culto neste período" description="Escolha outro período ou cadastre os próximos encontros para começar a acompanhar os gráficos." /></div>}
      <section className="card analytics-chart-card" aria-labelledby="analytics-evolution-heading"><div className="analytics-section-heading"><div><h2 id="analytics-evolution-heading">Evolução do planejamento</h2><p>Compare os encontros e os repertórios ao longo do tempo.</p></div><label className="field"><span>Mostrar no gráfico</span><select aria-label="Indicador da evolução" value={metric} onChange={event => setMetric(event.target.value as TimelineMetric)}>{(Object.keys(metricLabels) as TimelineMetric[]).map(value => <option key={value} value={value}>{metricLabels[value]}</option>)}</select></label></div><EvolutionChart points={report.timeline} metric={metric} grouping={report.timelineLabel} /></section>
      <div className="analytics-ranking-toolbar"><label className="field"><span>Quantidade nos rankings</span><select aria-label="Quantidade nos rankings" value={limit} onChange={event => setLimit(event.target.value)}><option value="10">Até 10 resultados</option><option value="20">Até 20 resultados</option><option value="all">Todos os resultados</option></select></label><p>Pessoas e músicas contam uma vez em cada culto, mesmo com mais de uma função ou repetição no repertório.</p></div>
      <div className="analytics-chart-grid">
        <section className="card analytics-chart-card" aria-labelledby="analytics-people-heading"><h2 id="analytics-people-heading">Pessoas mais escaladas</h2><p>Em quantos cultos cada pessoa participa da escala.</p><label className="field analytics-ranking-search"><span>Buscar pessoa</span><input aria-label="Buscar pessoas nas análises" type="search" placeholder="Nome ou função" value={personSearch} onChange={event => setPersonSearch(event.target.value)} /></label><BarList rows={people.slice(0, shown)} percentageLabel="dos cultos" empty={personQuery ? 'Nenhuma pessoa corresponde à busca.' : 'Nenhuma pessoa escalada neste período.'} detail={row => row.functions.join(' · ')} /><p className="analytics-result-count">{number(Math.min(people.length, shown))} de {number(people.length)} pessoas.</p></section>
        <section className="card analytics-chart-card" aria-labelledby="analytics-songs-heading"><h2 id="analytics-songs-heading">Músicas mais utilizadas</h2><p>Em quantos repertórios cada música aparece.</p><label className="field analytics-ranking-search"><span>Buscar música</span><input aria-label="Buscar músicas nas análises" type="search" placeholder="Título ou artista" value={songSearch} onChange={event => setSongSearch(event.target.value)} /></label><BarList rows={songs.slice(0, shown)} percentageLabel="dos cultos" empty={songQuery ? 'Nenhuma música corresponde à busca.' : 'Nenhuma música no repertório deste período.'} detail={row => row.artist} destination={row => knownSongs.has(row.id) ? `/musicas/${row.id}` : undefined} /><p className="analytics-result-count">{number(Math.min(songs.length, shown))} de {number(songs.length)} músicas.</p></section>
        <section className="card analytics-chart-card" aria-labelledby="analytics-themes-heading"><h2 id="analytics-themes-heading">Temáticas dos cultos</h2><p>Distribuição dos encontros por tipo de culto.</p><BarList rows={report.themes} percentageLabel="dos cultos" empty="Nenhuma temática no período." /></section>
        <section className="card analytics-chart-card" aria-labelledby="analytics-functions-heading"><h2 id="analytics-functions-heading">Funções na escala</h2><p>{number(report.assignments)} atribuições de funções. A mesma pessoa pode exercer mais de uma função em um culto.</p><BarList rows={report.functions} percentageLabel="das atribuições" empty="Nenhuma função escalada no período." /></section>
        <section className="card analytics-chart-card" aria-labelledby="analytics-tags-heading"><h2 id="analytics-tags-heading">Etiquetas dos repertórios</h2><p>Cada uso de uma música conta em todas as suas etiquetas. Por isso, os percentuais podem somar mais de 100%.</p><BarList rows={report.tags} percentageLabel="dos usos de músicas" empty="Nenhuma música para classificar neste período." /></section>
        <section className="card analytics-chart-card" aria-labelledby="analytics-times-heading"><h2 id="analytics-times-heading">Horários dos encontros</h2><p>Distribuição dos cultos pelos horários cadastrados.</p><BarList rows={report.times} percentageLabel="dos cultos" empty="Nenhum horário no período." /><div className="analytics-planning-coverage"><h3>Planejamento preenchido</h3><p><strong>{number(report.servicesWithTeam)} de {number(report.services)}</strong> cultos com equipe</p><p><strong>{number(report.servicesWithSongs)} de {number(report.services)}</strong> cultos com repertório</p></div></section>
      </div>
      <section className="card analytics-inventory" aria-labelledby="analytics-inventory-heading"><div><h2 id="analytics-inventory-heading">Cadastros do ministério</h2><p>Fotografia atual da biblioteca e da equipe. Estes totais não mudam com o filtro de período.</p></div><dl><div><dt><Music2 size={18} /> Músicas cadastradas</dt><dd>{number(report.inventory.songs)}</dd><small>{number(report.inventory.unusedSongs)} sem uso no período selecionado</small></div><div><dt><Users size={18} /> Pessoas cadastradas</dt><dd>{number(report.inventory.people)}</dd><small>{number(report.inventory.unscheduledPeople)} sem escala no período selecionado</small></div><div><dt><Tags size={18} /> Etiquetas cadastradas</dt><dd>{number(report.inventory.tags)}</dd><small>Disponíveis para organizar músicas</small></div></dl></section>
    </>}
  </div>;
}

import { Dice5, Ticket, Radio, Gamepad2 } from 'lucide-react';
import './central.css';

const jogos = [
  { nome: 'Sintonia', href: '/sintonia.html', descricao: 'Dê uma pista e ajuste o ponteiro para descobrir onde está o alvo secreto.', icone: Radio, tema: 'sintonia' },
  { nome: 'Bingo 75', href: '/bingo.html', descricao: 'Gire o globo, acompanhe as 75 bolas e marque sua cartela.', icone: Dice5, tema: 'bingo' },
  { nome: 'Sorteador', href: '/sorteador/', descricao: 'Importe os participantes, sorteie os ganhadores e salve o resultado.', icone: Ticket, tema: 'sorteio' },
];

export default function Central() {
  return <main className="central"><header><Gamepad2 aria-hidden="true"/> Central de Jogos</header>
    <section><h1>Escolha seu jogo<span>.</span></h1>
    <nav aria-label="Jogos disponíveis">{jogos.map(({nome,href,descricao,icone:Icon,tema}) =>
      <a key={href} href={href} className={tema}><div className="cartaz" aria-hidden="true"><Icon strokeWidth={1.35}/></div>
      <div className="detalhes"><h2>{nome}</h2><p>{descricao}</p><strong>Abrir jogo</strong></div></a>)}</nav></section></main>;
}

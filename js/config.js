// Tudo que muda de uma barbearia para outra fica aqui.
// Serviços, preços, barbeiros e horários são EXEMPLOS até o dono confirmar.
const CONFIG = {
  nome: "Hat-Trick",
  nomeCompleto: "Hat-Trick Barber Sport",
  cidade: "Pelotas/RS",
  endereco: "Centro, Pelotas/RS (endereço completo a confirmar)",
  whatsapp: "5553991746454", // telefone público da barbearia no Google Maps
  pagamentos: "Pix, cartão e dinheiro (a confirmar)",
  antecedenciaMin: 30,
  passoMin: 15,
  diasNoChat: 7,
  metaTemporada: 10, // cortes para ganhar um grátis (regra de exemplo)

  // esporte: futebol | nba | f1 (define o ícone e o "apelido" do serviço)
  servicos: [
    { id: "corte", nome: "Corte Camisa 10", desc: "Corte clássico, tesoura e máquina", duracao: 30, preco: 45, esporte: "futebol" },
    { id: "degrade", nome: "Degradê Pit Stop", desc: "Degradê navalhado, acabamento rápido", duracao: 40, preco: 50, esporte: "f1" },
    { id: "barba", nome: "Barba MVP", desc: "Barba com toalha quente e navalha", duracao: 30, preco: 35, esporte: "nba" },
    { id: "combo", nome: "Combo Hat-Trick", desc: "Corte + barba + sobrancelha", duracao: 70, preco: 85, esporte: "futebol" },
    { id: "infantil", nome: "Corte Categoria de Base", desc: "Até 12 anos", duracao: 30, preco: 35, esporte: "futebol" },
    { id: "pezinho", nome: "Pezinho Volta Rápida", desc: "Acabamento entre um corte e outro", duracao: 15, preco: 15, esporte: "f1" },
    { id: "sobrancelha", nome: "Sobrancelha Cesta de 3", desc: "Na navalha ou pinça", duracao: 15, preco: 15, esporte: "nba" },
  ],

  // folga: dias da semana (0 = domingo ... 6 = sábado)
  // Cada barbeiro "joga" um esporte no app — muda o estilo do cartão no Elenco.
  barbeiros: [
    { id: "b1", nome: "Barbeiro 1", numero: 10, esporte: "futebol", posicao: "Meia-armador", especialidade: "Degradê e corte social", folga: [] },
    { id: "b2", nome: "Barbeiro 2", numero: 23, esporte: "nba", posicao: "Pivô", especialidade: "Barba e navalha", folga: [3] },
    { id: "b3", nome: "Barbeiro 3", numero: 44, esporte: "f1", posicao: "Piloto", especialidade: "Máquina, freestyle e pezinho", folga: [6] },
  ],

  expediente: {
    0: null,
    1: null,
    2: { abre: "09:00", fecha: "19:00", almoco: ["12:00", "13:00"] },
    3: { abre: "09:00", fecha: "19:00", almoco: ["12:00", "13:00"] },
    4: { abre: "09:00", fecha: "20:00", almoco: ["12:00", "13:00"] },
    5: { abre: "09:00", fecha: "20:00", almoco: ["12:00", "13:00"] },
    6: { abre: "08:00", fecha: "17:00", almoco: null },
  },

  // "Seu time": o cliente escolhe e o app ganha as cores dele.
  times: [
    { grupo: "Futebol", itens: [
      { id: "xavante", nome: "Brasil de Pelotas", cores: ["#d71920", "#111111"] },
      { id: "lobao", nome: "Pelotas", cores: ["#f5c400", "#0a3d91"] },
      { id: "gremio", nome: "Grêmio", cores: ["#0d80bf", "#111111"] },
      { id: "inter", nome: "Internacional", cores: ["#e5050f", "#ffffff"] },
      { id: "flamengo", nome: "Flamengo", cores: ["#c4161c", "#111111"] },
      { id: "corinthians", nome: "Corinthians", cores: ["#f2f2f2", "#111111"] },
      { id: "palmeiras", nome: "Palmeiras", cores: ["#1a8a3a", "#ffffff"] },
    ]},
    { grupo: "NBA", itens: [
      { id: "lakers", nome: "Lakers", cores: ["#fdb927", "#552583"] },
      { id: "celtics", nome: "Celtics", cores: ["#00a24a", "#ffffff"] },
      { id: "bulls", nome: "Bulls", cores: ["#ce1141", "#111111"] },
      { id: "warriors", nome: "Warriors", cores: ["#ffc72c", "#1d428a"] },
    ]},
    { grupo: "F1", itens: [
      { id: "ferrari", nome: "Ferrari", cores: ["#e8002d", "#ffeb00"] },
      { id: "mclaren", nome: "McLaren", cores: ["#ff8000", "#111111"] },
      { id: "mercedes", nome: "Mercedes", cores: ["#27f4d2", "#111111"] },
      { id: "redbull", nome: "Red Bull", cores: ["#3671c6", "#ffd100"] },
    ]},
  ],

  // Estilos que a galera pede citando jogador/piloto (só texto; fotos são da barbearia)
  inspiracoes: [
    { ref: "Neymar", servico: "degrade", estilo: "Degradê alto com topete", esporte: "futebol" },
    { ref: "Vini Jr.", servico: "degrade", estilo: "Twists com degradê navalhado", esporte: "futebol" },
    { ref: "Cristiano Ronaldo", servico: "corte", estilo: "Social com risca e laterais baixas", esporte: "futebol" },
    { ref: "LeBron James", servico: "barba", estilo: "Barba cheia desenhada", esporte: "nba" },
    { ref: "Stephen Curry", servico: "combo", estilo: "Curto texturizado, barba rente", esporte: "nba" },
    { ref: "Lewis Hamilton", servico: "corte", estilo: "Tranças e laterais raspadas", esporte: "f1" },
  ],
};

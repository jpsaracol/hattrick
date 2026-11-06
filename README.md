# Hat-Trick Barber Sport · app (demonstração)

App (PWA) de agendamento para a Hat-Trick Barber Sport, Centro de Pelotas/RS.
Instala no celular pelo navegador ("Adicionar à tela inicial"), sem loja de apps.

## Temas
- **Futebol:** Elenco (barbeiros como cartões de jogador) e o gramado da tela inicial
- **F1:** Agendamento em 4 "voltas", horários num grid de largada e luzes de largada ao confirmar
- **NBA:** Temporada de fidelidade (cestas até o corte grátis) em uma quadra
- **Seu time:** o cliente escolhe o time e o app muda de cor; a cor é clareada sozinha se ficar ilegível

## Painel do barbeiro (`painel.html`)
- Agenda do dia em colunas (uma por barbeiro), com almoço, folga e linha do "agora"
- Resumo: horários, faturamento previsto e já atendido, ocupação, próximo cliente
- De onde vieram os horários: App, WhatsApp, Telefone, Balcão
- **Registrar horário** marcado por WhatsApp, telefone ou no balcão; tocar num espaço livre já abre o formulário com barbeiro, dia e hora
- Tocar num horário: atendido, faltou, cancelar, confirmar no WhatsApp, ligar
- Na demo, painel e app usam o mesmo armazenamento do navegador; na versão real, os dois leem a mesma agenda na nuvem e o painel tem login

## Login e agenda na nuvem (Supabase)
Sem chave no `js/config.js`, o app roda em **modo demonstração** (dados só no aparelho, horários de exemplo e o seletor "Ver como" no painel).
Com a chave, liga o modo real:
- **Cliente:** cria conta (nome, celular, e-mail, senha), marca, vê e cancela os próprios horários em qualquer aparelho, e apaga a conta (LGPD)
- **Barbeiro:** entra no painel e vê e edita **só a própria agenda e o próprio expediente**
- **Dono:** vê todos, edita cartões do elenco e libera o acesso da equipe pelo e-mail
- O banco recusa sozinho horário sobreposto, fora do expediente, no almoço ou bloqueado (`supabase/schema.sql`, com 38 testes de permissão)

### Como ativar (uma vez)
1. Em [supabase.com](https://supabase.com), entre com o GitHub e crie um projeto: nome `hattrick`, região **South America (São Paulo)**. Guarde a senha do banco.
2. **SQL Editor → New query**: cole todo o `supabase/schema.sql` e clique em **Run**.
3. **Authentication → URL Configuration**: Site URL `https://jpsaracol.github.io/hattrick/` (e a mesma em Redirect URLs).
   Para testar mais rápido, dá para desligar **Confirm email** em Authentication → Sign In / Providers → Email.
4. **Project Settings → API**: copie a **Project URL** e a chave **anon public** para `CONFIG.supabase` no `js/config.js`.
   A chave anon é pública por natureza (quem protege os dados são as regras do banco). **Nunca** use a chave `service_role` no site.
5. Crie a conta do dono pelo app e rode no SQL Editor: `select tornar_dono('email-do-dono@exemplo.com');`
6. No painel (aba Equipe), o dono libera cada barbeiro pelo e-mail da conta dele.

## Arquivos
- `js/config.js`: tudo da barbearia (serviços, preços, barbeiros, horários, times, referências)
- `js/agenda.js`: expediente por barbeiro, bloqueios e horário livre (mesmas funções nos dois modos)
- `js/nuvem.js`: login, cadastro e agenda no Supabase
- `supabase/schema.sql`: tabelas, regras de acesso (RLS) e funções do banco
- `js/app.js`: telas e fluxo do cliente
- `js/painel.js` + `css/painel.css`: painel do barbeiro
- `sw.js`: cache offline. **Ao alterar arquivos, suba a VERSAO.**

## Antes de entregar ao cliente
- [ ] Serviços, preços, nomes e fotos reais dos barbeiros, folgas e horário de funcionamento
- [ ] Endereço completo, razão social e CNPJ na página de privacidade
- [ ] Regra real da fidelidade
- [ ] Fotos de cortes feitos na barbearia nos "Pedidos da galera"
- [ ] Ativar o Supabase (passo a passo acima) e liberar o acesso de cada barbeiro
- [ ] Tirar a faixa "Demonstração"

## Rodar local
    python3 -m http.server 8000   # abrir http://localhost:8000

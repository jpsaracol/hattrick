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

## Arquivos
- `js/config.js`: tudo da barbearia (serviços, preços, barbeiros, horários, times, referências)
- `js/agenda.js`: regras de horário livre (vêm do projeto Na Régua)
- `js/app.js`: telas e fluxo do cliente
- `js/painel.js` + `css/painel.css`: painel do barbeiro
- `sw.js`: cache offline. **Ao alterar arquivos, suba a VERSAO.**

## Antes de entregar ao cliente
- [ ] Serviços, preços, nomes e fotos reais dos barbeiros, folgas e horário de funcionamento
- [ ] Endereço completo, razão social e CNPJ na página de privacidade
- [ ] Regra real da fidelidade
- [ ] Fotos de cortes feitos na barbearia nos "Pedidos da galera"
- [ ] Agendamentos indo para a agenda da barbearia (planilha/servidor) e painel do barbeiro
- [ ] Tirar a faixa "Demonstração"

## Rodar local
    python3 -m http.server 8000   # abrir http://localhost:8000

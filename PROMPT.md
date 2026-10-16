# Prompt — App "Banco de laudos" · estado em 16/10/2026 (v2.1)

> Cole este texto numa conversa nova do Claude Code e diga o que quer mudar. Ele substitui a memória da conversa anterior.
> Este arquivo é atualizado a cada mudança (pedido do Artur: poder dar /clear e continuar daqui).
> **Onde paramos (16/10/2026, noite):** v2.2 publicada (seção 10). **Falta conferir na tela** os filtros novos (botões na barra
> verde) no PC e no celular e o destaque aprendido com os laudos reais (seção 9). Extensão na **v1.12.2**.

## 0. Para continuar em outro computador
1. Pedir ao Claude Code: "leia o PROMPT.md do repositório arturaragao/banco-laudos e o extensao-laudos-vue/PROMPT.md do
   arturaragao/Artur- e vamos continuar". Precisa de Git + `gh` logado (`gh auth login`) e Node.js.
2. Clonar: `gh repo clone arturaragao/banco-laudos` (público) e `gh repo clone arturaragao/Artur-` (privado; branch padrão
   `claude/vigilant-pasteur-abqqee`). No banco-laudos: `npm i` e `npm test` (21 testes) · `npm run dev` = http://localhost:8765
   (a extensão também conversa com essa origem).
3. Publicar = `git push` na `main` do banco-laudos (GitHub Pages atualiza em ~1 min; o service worker busca a versão nova —
   subir `CACHE` no `sw.js` a cada publicação). Extensão = PR + merge automático na branch padrão do Artur- e subir `version`.
4. Usar o app (qualquer aparelho): https://arturaragao.github.io/banco-laudos/ › ☁ Conectar (conta Google do Drive dele).
   Num PC novo com a extensão: instalar a extensão como diz o PROMPT.md dela, abrir o app e ⇅ (traz os laudos da extensão).

## 1. O que é
App web (PWA) do Artur (radiologista) com o **banco de laudos** da extensão **Copiar Laudos Vue** (repo privado
`arturaragao/Artur-`, pasta `extensao-laudos-vue/`, ver o `PROMPT.md` de lá) fora do Chrome do PC: abre no **celular Android**
e em qualquer PC, com os dados no **Google Drive** do Artur. Mesma busca/filtros/edição da página Banco da extensão.
**Não gasta tokens** (tudo roda no navegador). Publicado em **https://arturaragao.github.io/banco-laudos/**
(repo **público** `arturaragao/banco-laudos` — só código, nenhum laudo; os dados ficam só no Drive, privados — LGPD).

## 2. Decisões do Artur (16/10/2026)
- Opção escolhida: **PWA + Google Drive** (outras avaliadas: extensão no celular/Kiwi, GitHub como banco, Supabase,
  Obsidian, Remote Desktop, só Notion). Se o Drive ficar pesado, **migrar para o Supabase**: só trocar o adaptador
  (`lib/drive.js`) por outro com as mesmas funções (ver `lib/nuvem.js`) + um script de cópia única.
- Volume: ~600 laudos (crescendo muito), ~4 imagens por laudo em média.
- **Extensão continua como está** (Banco + Notion). Só foram **acrescentadas** a ponte com o app e a opção de desligar a
  sincronização com o Notion. Notion fica por enquanto, desligável.
- **Tirados os filtros de idade e sexo** (o cartão ainda mostra idade/sexo).
- Mesmas preferências de trabalho da extensão: poucos tokens, testar a lógica em node, o Artur faz os testes de uso.

## 3. Como os dados andam
```
Portal Vue Motion → extensão (banco do Chrome do PC) ⇄ app aberto NESSE PC (ponte.js) ⇄ Google Drive ⇄ app no celular/outros PCs
                                         ↘ Notion (Notas Tomografia), se ligado nas Opções da extensão
```
- **Drive**: pasta "Banco de laudos" com um arquivo por mês do exame (`laudos-2026-10.json.gz`: texto de todos os laudos
  do mês, gzip) e a subpasta "imagens" (um arquivo por imagem chave). Escopo `drive.file` (o app só vê o que criou).
- **Regra**: vale o registro com o `mudadoEm` mais novo. Apagar = lápide `{acc, data, apagado: true, mudadoEm}`.
  Antes de gravar um mês, confere se outro aparelho mexeu nele (versão do arquivo) e junta.
- **Ponte com a extensão** (só no PC onde ela está): ao abrir o app, ele traz da extensão os laudos novos/editados (com as
  imagens) e leva para ela as edições/exclusões feitas no app. Compara o momento em que o **conteúdo** mudou
  (`max(salvoEm, conteudoEditadoEm, resumoManualEm)` na extensão), porque a sincronização com o Notion mexe no `editadoEm`
  sem mudar o texto. Edição levada à extensão → ela reescreve o toggle no Notion na próxima sincronização.
  **Limite**: laudos copiados pela extensão só chegam ao Drive quando o app é aberto naquele PC (deixar uma aba fixa).
- **Ordem do envio** (corrigida em 16/10 depois do 1º teste: o PC mandava as imagens primeiro, uma a uma, ~2 s cada; a aba
  parou no meio e o Drive ficou só com imagens, sem nenhum `laudos-*.json.gz`, e o celular não recebeu nada): agora vai
  **primeiro o texto de todos os meses**, depois as imagens **4 laudos em paralelo**, regravando os meses a cada 20 laudos;
  cada imagem enviada é anotada na hora (se parar, continua de onde parou). Durante a sincronização a tela não dorme
  (Wake Lock).
- **Nada repetido no Drive** (pedido do Artur): cada imagem leva o hash SHA-256 (`appProperties.hash`); antes de enviar, o app
  procura uma igual (mesmo hash, ou mesmo nome `acesso_i` das antigas) e reaproveita. As cópias repetidas da 1ª tentativa
  são apagadas uma vez (`limparRepetidas`, `meta.limpezaImagens`), só no PC que envia as imagens e depois de enviar tudo;
  nunca apaga uma imagem que algum laudo usa (`escolherRepetidas` em `lib/drive.js`). Laudo nunca repete (chave = acesso).
- **Celular**: o texto de todos os laudos fica no aparelho (busca offline); as imagens baixam do Drive ao abrir o laudo e
  ficam guardadas.
- **Login Google**: token de 1 h, sem servidor (Google Identity Services). Depois de 1 h, o botão vira
  "☁ Conectar e sincronizar" (um toque; a janelinha do Google abre e fecha sozinha).

## 4. Arquivos
| Arquivo | Papel |
|---|---|
| `index.html`, `app.js` | a página (porte do `banco.html/js` da extensão); ⚙ Configurações num `<dialog>` |
| `lib/filtros.js`, `lib/secoes.js`, `lib/laudo2notion.js` | **cópias exatas** das da extensão — ao mudar lá (ex.: `RESUMO_VERSAO`), copiar para cá |
| `lib/regras.js` | edição (`camposDaEdicao`) e resumo (`recalculo`) = `salvarEdicao`/`recalcularResumos` do background da extensão |
| `lib/db.js` | IndexedDB `bancoLaudosApp` (laudos, imagens em cache, meta) |
| `lib/nuvem.js` | sincronização com qualquer nuvem (adaptador) |
| `lib/drive.js` | adaptador Google Drive + login |
| `lib/ponte.js` | conversa com a extensão (`window.postMessage` ↔ `ponte.js` da extensão ↔ `ponte()` no background dela) |
| `config.js` | **`clienteId`** do OAuth (já preenchido) |
| `sw.js`, `manifest.webmanifest`, `icons/` | PWA (abre offline; instalar pelo Chrome › "Adicionar à tela inicial") |
| `ferramentas/testes.mjs` | 18 testes da sincronização (Drive e extensão falsos, PC + celular): `npm i && npm test` |
| `ferramentas/servidor.mjs` | servidor local `http://localhost:8765` (a extensão também conversa com essa origem) |
| `ferramentas/gerar_icones.mjs` | gera os ícones |
Campos só locais (não vão à nuvem): `nuvemEm`, `imgsLocais`. Na nuvem: `imgs` (ids das imagens no Drive), `mudadoEm`, `apagado`.

## 5. Criar o ID OAuth (uma vez, grátis) — FEITO em 16/10/2026 (refazer só se perder o projeto)
1. https://console.cloud.google.com › criar projeto "Banco de laudos" (o mesmo projeto pode servir ao app-calorias).
2. APIs e serviços › Biblioteca › **Google Drive API** › Ativar.
3. Tela de permissão OAuth (Google Auth Platform): tipo **Externo**, nome "Banco de laudos", e-mail do Artur; escopo
   `.../auth/drive.file`. Para **Publicar o app** (Em produção) o Google exige, em **Branding**: página inicial
   `https://arturaragao.github.io/banco-laudos/`, política de privacidade
   `https://arturaragao.github.io/banco-laudos/privacidade.html` (criada em 16/10) e domínio autorizado
   `arturaragao.github.io`. Com `drive.file` não precisa de verificação; em produção o acesso não expira a cada 7 dias como
   no modo Teste (aparece só um aviso de "app não verificado" no primeiro login).
4. Credenciais › Criar › **ID do cliente OAuth** › Aplicativo da Web › Origens JavaScript autorizadas:
   `https://arturaragao.github.io` e `http://localhost:8765`. Sem URI de redirecionamento.
5. Copiar o **ID do cliente** (termina em `.apps.googleusercontent.com`) e mandar na conversa → vai para `config.js`.

## 6. Histórico do teste de uso
- ID OAuth criado em 16/10 (`52135680165-osm3…apps.googleusercontent.com`, projeto "Banco de laudos", já em `config.js`).
- 1º teste (16/10): o PC enviou só parte das imagens e nenhum texto (corrigido: texto primeiro, imagens em paralelo e
  retomáveis); imagens repetidas no Drive (corrigido: nada repete, cópias antigas apagadas uma vez).

## 7. v2 (16/10/2026): layout, filtros e funções escolhidos pelo Artur
**Layout**: opção 1 (Clínico refinado, verde) + **tema escuro no estilo da opção 2** (Estação PACS: #0E1116, ciano #4FC3F7,
destaque âmbar). Botão ◐ alterna; Configurações › Tema: automático/claro/escuro. **Conclusão completa** em todo cartão.
No PC (≥ 1000 px) os filtros ficam numa barra lateral; no celular, no botão "Filtros".
As outras opções mostradas (não escolhidas): 3 Editorial, 4 Facetas (a ideia de facetas entrou mesmo assim), 5 Material.

**Filtros escolhidos** (sugestões 1, 2, 3, 5, 6, 7, 8 — a 4, medidas tipo "nódulo > 8 mm", ele NÃO quis):
- facetas com contagem: Modalidade, Exame, Médico, Classificações, Achados, Coleções (a contagem de cada grupo ignora o
  próprio grupo; 8 por grupo + "todos");
- classificações por regra (`lib/classificacoes.js`): BI-RADS, TI-RADS, LI-RADS, PI-RADS, Lung-RADS, O-RADS, Bosniak, Fleischner;
- buscar em Tudo / Conclusão / Achados / Indicação;
- busca aproximada (`lib/aproximada.js`): palavra que não existe em nenhum laudo vira a mais parecida e aparece
  "Busquei por …";
- etiquetas de achado / classificação / coleção clicáveis no cartão;
- períodos rápidos (7 d, 30 d, 12 m, datas) e ordem (recentes, antigos, relevância);
- buscas salvas + histórico (sincronizados). Número de acesso (5+ dígitos) na busca acha o laudo direto.

**Funções escolhidas** (todas as 10):
termos buscados destacados (`<mark>`) · favorito ★, coleções e nota pessoal (anotações `fav`, `colecoes`, `nota`,
`lixeiraEm` + `anotEm`; não vão para a extensão nem mexem no Notion) · visor de imagens em tela cheia (`ui/visor.js`:
deslizar, pinça, dois toques, roda do mouse, setas) · laudos parecidos (mesmas etiquetas/classificações, +exame igual) ·
estatísticas da busca (por mês, achados, classificações, exames, médicos; tocar filtra) · modo estudo (imagens primeiro,
conclusão escondida) · frases-modelo (＋ Frase no laudo aberto usa o trecho selecionado; ⋯ › Frases-modelo) · exportar
CSV (Excel, ";") e PDF (imprimir) · lixeira de 30 dias (depois vira lápide e as imagens saem do Drive) · atalhos
(`/` `j` `k` Enter `f` `e` `c` `t` Esc `?`).

**Sincronização v2**: junta por partes — conteúdo (`conteudoMudadoEm`) e anotações (`anotEm`) — então favorito no celular e
edição no PC no mesmo laudo ficam os dois. Preferências em `preferencias.json.gz` (`lib/prefs.js`, item a item: buscas,
histórico, frases, coleções). A ponte com a extensão compara só o conteúdo e preserva as anotações do app.
Arquivos novos: `lib/indice.js` (índice, facetas, ordem, destaque, parecidos, estatísticas), `lib/classificacoes.js`,
`lib/aproximada.js`, `lib/prefs.js`, `ui/visor.js`. Testes (na v2): 18 em `ferramentas/testes.mjs`.

## 8. v2.1 (16/10/2026): ajustes pedidos depois de ver a v2
- **"Achados" (etiquetas laranja) escondidos**: some do cartão, dos filtros e das estatísticas. Os dados continuam salvos
  (`etiquetas`, grupo `achado` no `lib/indice.js`); para voltar, pôr "achado" em `GRUPOS` no `app.js`.
- **Destaque novo da conclusão** (`lib/destaque.js`, só no app; o `destacarConclusao` da extensão continua igual lá):
  item normal/recomendação/comparação/irrelevante (pequeno derrame, alterações degenerativas, granulomas calcificados, cistos
  simples, "não se aplica"...) fica sem destaque; no item alterado destaca o ACHADO + adjetivos ("Nódulo pulmonar sólido"),
  o diagnóstico depois de "sugestivo de/compatível com" e as classificações; nunca medidas, lado, lugar, "leve/discreto" ou
  trecho negado. O negrito/sublinhado antigo da conclusão (vindo do Notion) é trocado por este, menos nos laudos com
  `destaqueManual` (formatados à mão). Para afinar: o Artur manda "como está / como quero" e se ajustam as listas
  `NADA`, `ACHADOS`, `PARA`, `ANTES` do `lib/destaque.js` (+ teste em `ferramentas/testes.mjs`).
- **Títulos agrupados** (`lib/nomes.js`, `tituloExame`): sem "DE/DA/DO/DOS/DAS", ABDÔMEN/ABDOMEN → ABDOME, TOMOGRAFIA → TC,
  RESSONÂNCIA → RM, ULTRASSONOGRAFIA → US; a grafia mais usada (com acento) vira a oficial. "TC DE TÓRAX" = "TC TÓRAX".
- **Médicos** (`nomeMedico`): sem "Dr./Dra.", só a primeira letra de cada nome maiúscula ("João da Silva").
- **Modalidade**: lê "ct", "CT\SR"... e, sem modalidade, o começo do título — não aparece mais um "TC" repetido.
- **Filtros em cima** da lista (não mais na lateral), abrem/fecham no botão "Filtros" (no PC começam abertos).
- **Períodos**: Tudo · Hoje · 3d · 7d · 30d · 3m · 12m (+ datas no painel). **Tirado o "Com imagem".** ★ = só favoritos.
- **Relevância** = laudos com alterações mais raras/interessantes/complexas primeiro: soma da raridade (idf) dos 3 achados e
  classificações mais raros do banco + gravidade (neoplasia, TEP, aneurisma, RADS alto...) + nº de itens alterados.
  Normais no fim. Testes: 21.

## 10. v2.2 (16/10/2026, noite): pedidos do Artur
- **Destaque aprendido** (`lib/aprendizado.js`): laudo com negrito feito à mão = `destaqueManual` OU editado (`conteudoEditadoEm`) com
  o negrito da conclusão diferente do automático da extensão (`destacarConclusao`). Esses ficam como ele deixou, e deles sai
  `sempre` (trechos que ele destacou e o app não) e `nunca` (palavras que ele tirou mais vezes do que destacou), aplicados
  a todos os outros (`definirAprendizado` em `lib/destaque.js`). ⚙ Configurações mostra o que foi aprendido. **Ao mexer nas
  regras do destaque: olhar antes os laudos feitos à mão (são o gabarito).**
  Causa achada: os 3 laudos que ele editou no Notion perdiam a marca — a extensão (1.12.2) agora marca `destaqueManual` em
  `edicoesDoNotion` quando o negrito difere do automático (`negritoAMao`).
- **Filtros na barra verde**: cada grupo (Modalidade, Exame, Médico, Classificações, Coleções, Laudos, Datas, Buscas salvas) é
  um botão que abre as opções por cima (`.dd/.pop`, com campo Procurar quando há mais de 10); "✕ Limpar (n)" quando há filtro.
  Igual no PC e no celular (linha quebra, nada escondido). Saíram o botão "Filtros" e a alça de altura.
- **Médicos**: sem "(DR)/(DRA)/(DR. )" e na ordem certa: "SIMEÃO PEDRO, MONICA" -> "Monica Simeão Pedro" (`nomeMedico`).
- **Modalidade**: título primeiro (TC/RM/ANGIOTOMOGRAFIA/RNM/URO-TC...), depois a do portal (TC/RM antes das outras), depois
  o texto do laudo. Com os 656 laudos reais deu TC 380 · RM 274 · Outros 2 ("OUTROS LAUDOS" = complementos). Se o Artur
  ainda vir TC/RM faltando, pedir para recarregar (Ctrl+Shift+R) e dizer em qual aparelho. Testes: 24.

## 9. Pendências
0. **Conferir a v2.2 na tela** (PC e celular): botões de filtro na barra verde abrem/fecham e se posicionam bem; ⚙ mostra o
   destaque aprendido; os 3 laudos editados no Notion (568779247, 855830755, 855857399) ficam com o negrito dele.
1. Teste de uso da v2.1/v2.2 pelo Artur: PC com a extensão (Ctrl+Shift+R, ⇅ até terminar as imagens) e depois o celular.
2. Depois do teste: decidir se a página Banco da extensão passa a abrir o app e se o Notion é desligado.

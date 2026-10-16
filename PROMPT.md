# Prompt — App "Banco de laudos" · estado em 16/10/2026 (v1)

> Cole este texto numa conversa nova do Claude Code e diga o que quer mudar. Ele substitui a memória da conversa anterior.
> Este arquivo é atualizado a cada mudança (pedido do Artur: poder dar /clear e continuar daqui).

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
| `ferramentas/testes.mjs` | 12 testes da sincronização (Drive e extensão falsos, PC + celular): `npm i && npm test` |
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

## 6. Pendências
1. ID OAuth criado em 16/10 (`52135680165-osm3…apps.googleusercontent.com`, projeto "Banco de laudos", já em `config.js`). Falta testar: PC com a extensão (abrir o app, ⚙ › Conectar, ⇅) e
   depois o celular (abrir o link no Chrome, Conectar, "Adicionar à tela inicial").
2. Depois do teste: decidir se a página Banco da extensão passa a abrir o app e se o Notion é desligado.
3. Melhorias de filtro (o Artur quer a melhor filtragem possível).

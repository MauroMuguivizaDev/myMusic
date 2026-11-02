# My Music · V2.5

Biblioteca musical pessoal, gratuita e local. React + TypeScript estrito + Vite, Tailwind CSS, Lucide, React Router, Dexie e PWA. Não requer contas, backend ou chaves. A pesquisa opcional de letras usa a LRCLIB. Ilustração do vinil e ícones criados em CSS/SVG; sem recursos remotos.


## Redesign — AMOLED + Album Immersive

A interface foi redesenhada diretamente no projeto. O dashboard substitui a landing page: saudação discreta, continuar a ouvir, recentes, favoritas, playlists e exploração de álbuns/artistas. Não há músicas de demonstração na aplicação. As secções usam apenas a biblioteca local e estados vazios compactos. “Continuar” retoma a faixa atual sem reiniciar a posição.

O tema principal continua AMOLED, agora com detalhes neutros. O reprodutor usa sempre luz ambiente suave calculada da capa, mesmo em AMOLED. Os seis IDs de temas foram preservados: AMOLED, Gaming Neon, Anime Night, Retro Arcade, Album Immersive e Custom. As identidades variam em fundos, luz, geometria, tipografia e texturas originais CSS; o tema Custom também permite uma imagem local de fundo. Não há imagens externas ou protegidas incluídas.

O mini-player tem 59 px no móvel, progresso de 2 px, capa, título/artista, play/pausa e seguinte quando há espaço. Só aparece quando existe uma faixa ativa. Fica 8 px acima da navegação de 58 px, acrescida da safe area. O conteúdo reserva espaço para ambos. O ecrã expandido concentra capa, título/artista/favorito, progresso, transporte e atalhos de letras/fila. Velocidade, temporizador, volume e terminar sessão estão em **Mais opções**. Em ecrãs baixos, a capa adapta-se para manter os controlos visíveis; em paisagem, a disposição usa duas colunas.

### Capas, artistas e álbuns

Em Biblioteca → “…” da música → **Editar música e capa**, podes definir título, artista, álbum e escolher uma capa JPEG, PNG ou WebP. O limite da imagem é 8 MB; é redimensionada para até 1000 px no lado maior e guardada como JPEG no catálogo local. Também se pode remover a capa. Os bytes do áudio original, a identidade SHA-256 e as referências de playlists/favoritos/histórico permanecem intactos. O backup JSON já inclui estes campos do catálogo.

Capas existentes em `Track.artwork` são agora apresentadas na biblioteca, dashboard, mini-player, fila e reprodutor. Se não existir capa ou a imagem falhar, aparece um placeholder original CSS. A cor ambiente é extraída localmente num canvas pequeno; não existe pesquisa automática de capas. **A leitura automática de tags/capas embutidas ainda não foi implementada.** Artistas e álbuns podem ser definidos manualmente; não são inventados a partir de nomes de ficheiros.

### Preservação e componentes

Não foi alterado o esquema IndexedDB: mantém-se a versão 2, as tabelas e todos os registos existentes. O campo opcional `artwork` já existia. A preferência opcional `backgroundImage` é validada e compatível com preferências antigas. Não limpes os dados do site para atualizar a interface; mantém a mesma origem/porta que usavas na V2.

Componentes modificados: `App`, `Player`, `Cover`, `TrackList` e `Modal`; novos componentes `Dashboard` e `TrackEditor`. Estilos e temas: `src/App.css`, `src/domain/themes.ts`. Integração: `src/hooks/usePlayer.ts` passa a expor os metadados atuais do catálogo sem recriar o áudio; `src/hooks/useArtworkColor.ts` extrai a paleta; `src/services/artwork.ts` prepara as imagens locais. Testes: `tests/design.test.tsx`, `e2e/design.spec.ts`, `e2e/fixtures.ts` e atualização dos percursos existentes em `e2e/my-music.spec.ts` para os novos menus. Não foram adicionadas dependências.

### Validação e capturas

Verificações do redesign: **34 testes unitários/de integração e 4 percursos E2E Edge**, lint e build de produção. A regressão conserva importação, reprodução, playlists, favoritos, histórico, fila, Media Session, letras/cache, offline, exportação e integridade dos originais/backups. O percurso novo verifica edição de metadados/capa durante a reprodução, persistência após recarregar, cores dinâmicas, temas, fundo personalizado, continuação da faixa, ausência de scroll horizontal e separação entre player/navegação.

Viewports: **320 × 568**, **414 × 896 (iPhone XS Max)**, **820 × 1180**, **1440 × 960** e **896 × 414 em paisagem**. As capturas foram inspecionadas e os problemas de menus junto ao player e controlos em ecrãs baixos foram corrigidos. Isto é validação no Edge com dimensões móveis, **não uma confirmação de Safari ou iPhone real**. A reprodução em segundo plano continua por validar num dispositivo físico.

- [Auditoria e capturas antes/depois](design-review/README.md).
- `design-review/before/` conserva a V2 anterior; `design-review/after/` contém dashboard, vazio, reprodutor, seis temas e tamanhos de ecrã.
- `test-results/redesign-*` contém as capturas dos testes automatizados, incluindo fundo personalizado e orientação horizontal.
- `node scripts/visual-review.mjs after` reproduz as capturas editoriais usando um servidor `npm run dev -- --port 4175 --strictPort`. Abre um contexto Edge temporário isolado e sem acesso aos dados de outro perfil. As capas e nomes das capturas editoriais são fixtures originais, usadas exclusivamente pelo script de teste.

Para rever no PC: `npm run build` e `npm run preview -- --port 4173`. Usa a origem anterior para conservar a tua biblioteca. Se tinhas a PWA aberta, fecha as janelas dessa origem e reabre com rede para permitir a atualização do service worker. Para iPhone, mantém o procedimento HTTPS local abaixo e testa safe areas, Safari, rotação, modo avião e ecrã bloqueado num dispositivo real.

## V2 — Reprodutor Musical Avançado

### Auditoria e compatibilidade

Foram lidos o README, os testes unitários e E2E e os módulos existentes. A V1 já separava domínio, serviços, hooks e componentes; não havia repositório Git nesta pasta. Os 11 testes originais passaram antes de implementar a V2. Preservam-se importação SHA-256, originais em IndexedDB, exportação/partilha, backup ZIP, PWA offline, pesquisa e os seis temas. Não foram acrescentadas dependências.

A base Dexie passa da versão 1 para 2, mantendo `tracks` e `files` e acrescentando `playlists`, `favorites`, `history` e `lyrics`. A migração e a preservação dos bytes têm teste automatizado. Remover uma música limpa as referências nas coleções numa transação; eliminar uma playlist conserva o áudio. Reimportar o original também repara um Blob ausente sem duplicar o catálogo.

### Experimentar a V2 no PC

1. Executa `npm run dev`, abre o endereço indicado e importa pelo menos três músicas. Em Biblioteca/Pesquisar, testa pesquisa, ordenação, favoritos e a seleção de coleções.
2. Cria uma playlist pelo formulário. No menu “…” de cada faixa, adiciona/remove músicas da playlist ou acrescenta à fila. Seleciona a playlist para editar o nome ou eliminá-la com confirmação.
3. Reproduzir uma faixa cria a fila a partir da lista apresentada, respeitando pesquisa e ordenação. A fila não admite a mesma faixa duas vezes. Ao importar outras músicas, o áudio atual continua.
4. Toca no título/capa do mini-player para expandir. Experimenta seguinte/anterior, progresso, volume, velocidade de 0,5× a 2×, shuffle e repetição off/all/one. Anterior após três segundos reinicia a faixa; antes disso recua. Repeat one repete apenas no fim natural; o botão seguinte continua a avançar.
5. Abre Fila, reordena com as setas, escolhe uma faixa, retira itens e limpa a fila. O fim natural sem repetição termina a sessão. Retirar a faixa atual interrompe-a; editar outros itens conserva o áudio. A opção “Terminar sessão” limpa os controlos do sistema e cancela o temporizador.
6. Ativa o temporizador (1 minuto facilita o teste). Ao vencer, pausa. Desliga-o para cancelar. É um temporizador da sessão atual; não continua depois de fechar/recarregar a aplicação e pode atrasar-se quando o sistema suspende a página.
7. Recarrega durante uma faixa. Fila, faixa, posição, volume, velocidade, shuffle e repeat são guardados em localStorage, com validação dos valores. A restauração fica **em pausa**. Playlists, favoritos e histórico ficam em IndexedDB. O histórico mostra a última reprodução de cada faixa; pausar/retomar não acrescenta duplicados. Nessa coleção prevalece a ordem cronológica de reprodução.
8. Abre Letras no reprodutor expandido. Preenche título e artista reais (a V1 ainda não lê tags), pesquisa e escolhe a versão. A aplicação apresenta texto normal ou LRC sincronizado e destaca a linha atual. Instrumentais, ausência de resultados, falhas HTTP/rede e limite de 15 segundos têm estados próprios. Não existem letras fictícias na aplicação.
9. A pesquisa envia apenas título e artista para `https://lrclib.net/api/search`. Resultados válidos ficam na cache IndexedDB pela combinação título/artista e podem ser consultados novamente sem rede; pesquisas sem resultados não ficam permanentemente em cache. Para mudar de gravação ou corrigir uma correspondência, edita os campos e escolhe outro resultado. Nesta versão, a escolha da letra e os campos de pesquisa não persistem após fechar a vista.
10. Se tinhas a V1 aberta como PWA, fecha todas as janelas dessa origem e reabre com rede para permitir a ativação da atualização; não limpes os dados do site, pois contêm a biblioteca. Para offline, executa `npm run build` e `npm run preview -- --port 4173`, espera pela preparação da PWA e repete o teste sem rede no mesmo endereço. O áudio e a cache de letras são locais; novas pesquisas de letras precisam de rede.

### Media Session e iPhone

A integração publica título, artista, álbum e capa real do catálogo quando disponível; usa o ícone local como capa genérica na ausência de imagem. Regista play, pausa, seguinte, anterior, seek e stop quando suportados, reporta posição/velocidade e limpa handlers/metadados ao terminar ou desmontar. APIs/ações não suportadas são ignoradas sem impedir a reprodução.

Segue a configuração HTTPS local da secção abaixo. No Safari e na aplicação adicionada ao ecrã principal, testa: importar, tocar, bloquear/desbloquear, controlos no ecrã bloqueado, auscultadores, chamadas/interrupções, seguinte/anterior, posição, modo avião, retoma e temporizador. Usa os botões físicos para volume, pois o iOS pode ignorar volume programático. Confirma também safe areas e rotação. **Não houve teste em iPhone real e não se afirma que a reprodução em segundo plano funciona.** Testes Edge e APIs simuladas não confirmam o comportamento do Safari/iOS.

### Ficheiros da V2

- `src/domain/music.ts`: tipos de coleções, letras e capa opcional; `src/domain/playback.ts`: estado persistido, shuffle, transições e seleção/ordenação.
- `src/services/library.ts`: migração e recuperação de ficheiros; `collections.ts`: playlists/favoritos; `lyrics.ts`: LRCLIB, cache e LRC; `export.ts`: backup com coleções.
- `src/hooks/usePlayer.ts`: fila, transporte, preferências, histórico e temporizador; `useMediaSession.ts`: controlos do sistema; `useCollections.ts`: consulta reativa.
- `src/components/Player.tsx`: mini-player, vista expandida e fila; `TrackList.tsx`: favoritos e ações; `LibraryControls.tsx`: coleções; `Lyrics.tsx`: pesquisa/letras; `Modal.tsx`: diálogo nativo com foco e Escape.
- `src/App.tsx` e `src/App.css`: integração, layout móvel, safe areas e animações respeitando movimento reduzido.
- `tests/player-v2.test.tsx`, `tests/v2.test.ts`, `tests/media-session.test.tsx` e `e2e/my-music.spec.ts`: cobertura V2 e regressão V1; `README.md`: instruções e limites.

O backup ZIP mantém os originais e passa a incluir playlists, favoritos e histórico em `library.json` (versão 2). Não inclui cache de letras nem estado localStorage. Continua sem restauro automático: extrai e reimporta os originais, conservando o catálogo JSON para consulta.

### Validação V2

Resultado desta entrega: **30 testes unitários/de integração aprovados, 3 percursos E2E no Microsoft Edge aprovados, lint sem erros e build de produção aprovado**. As capturas do mini-player e do reprodutor expandido a 390/414 px foram inspecionadas, sem transbordo horizontal. O TypeScript permanece estrito. Não houve push nem publicação.

Executa `npm test`, `npm run lint`, `npm run build` e depois `npm run test:e2e`. Os testes de navegador usam Edge instalado e a porta 4174. Os testes de letras usam respostas controladas, claramente identificadas como fixtures, sem depender da disponibilidade externa. Uma consulta HTTP adicional ao endpoint real LRCLIB devolveu resultados; isso não garante disponibilidade futura ou cobertura de todas as músicas.

Os testes cobrem migração V1, recuperação de Blob, coleções, limpeza de referências, persistência, transições/repetição/shuffle, fila editável, volume/velocidade/posição, temporizador, ficheiros ausentes, histórico, metadados/ações/limpeza Media Session, LRC e cache/erros. Os percursos Edge cobrem regressão V1, fluxo V2 com cache offline, letras normais/sincronizadas e estados vazios/erro. Capturas móveis ficam em `test-results/`.

Referências consultadas: [API LRCLIB](https://lrclib.net/docs) e [especificação Media Session](https://www.w3.org/TR/mediasession/).

## Auditoria inicial da V1

O projeto Vite existente foi preservado em `D:\Projetos\my-music`. Não existia `.git` nessa pasta. A pasta de contexto do chat (`vital-shop`) não foi modificada. Dependências iniciais: React, React DOM, Lucide, Vite, TypeScript e ESLint. O protótipo guardava apenas URLs temporários em memória; a limpeza do efeito revogava os URLs anteriores sempre que a lista mudava. Havia também estilos do template em conflito com o layout.

## Executar no PC

```powershell
cd D:\Projetos\my-music
npm ci
npm run dev
```

Abre o endereço indicado pelo Vite (habitualmente `http://127.0.0.1:5173`). O servidor liga apenas ao próprio PC por padrão. Para testar o modo offline, usa **o build de produção**:

```powershell
npm run build
npm run preview -- --port 4173
```

Abre `http://127.0.0.1:4173`, espera pela indicação “Aplicação pronta para abrir offline” e recarrega uma vez. As portas, protocolos e nomes de host definem bibliotecas diferentes: `localhost`, `127.0.0.1`, o IP da rede, HTTP e HTTPS não partilham IndexedDB. Mantém sempre o mesmo endereço durante um teste.

## Experimentar a V1

1. Importa dois ficheiros de áudio reais com “Importar músicas”. O limite é 200 MB por ficheiro. MP3 e AAC são boas opções para testes; outros formatos dependem do navegador e do codec.
2. Abre a biblioteca, reproduz uma faixa, pausa, avança, recua e muda a posição. No computador, testa também o volume; no iOS, utiliza os botões físicos de volume.
3. Enquanto reproduz, importa outra faixa: o áudio atual deve continuar. Importa uma cópia com outro nome: deve ser detetada como duplicada pelo SHA-256 do conteúdo.
4. Recarrega e confirma que as músicas continuam na biblioteca. Na V1 os títulos vêm dos nomes dos ficheiros; leitura de tags e capas faz parte da V3. A duração é guardada quando a música é aberta pelo reprodutor.
5. Experimenta os seis temas e recarrega. Custom permite escolher fundo e destaque com contraste. Album Art tem uma paleta neutra nesta etapa; extração dinâmica das cores da capa fica para a V3.
6. Exporta uma faixa pela biblioteca. Quando suportado, a partilha nativa permite “Guardar em Ficheiros”; caso contrário, é feito um download normal.
7. Em Definições, consulta o espaço, pede persistência e exporta um backup ZIP (até 300 MB). O ZIP contém os originais e `library.json`. Para recuperar o áudio, extrai o ZIP e importa os ficheiros; a V1 não oferece restauro automático de preferências ou catálogo.
8. No build de produção, usa DevTools → Network → Offline e recarrega. A interface e o áudio importado devem funcionar sem pedidos externos. Desativa novamente o modo offline depois do teste.
9. Remove uma música e confirma o diálogo. A remoção apaga o Blob e os metadados desta biblioteca; o original importado permanece no seu local.

Os ficheiros são guardados em IndexedDB, não no cache da PWA. O service worker guarda apenas os recursos da aplicação. O navegador ainda pode recusar armazenamento ou apagar dados sob pressão; navegação privada, limpeza de dados e desinstalação também podem causar perda. A aplicação não substitui os teus originais e backups. Erros de quota são apresentados e a transação impede que sejam guardados registos sem o respetivo áudio.

## iPhone na rede doméstica com HTTPS

1. Executa `npm run setup:https`. O script usa [mkcert](https://github.com/FiloSottile/mkcert), instala a CA no Windows e gera certificados para localhost e `192.168.1.136`. Se o IP mudar, executa `powershell -File scripts/setup-https.ps1 -LanAddress NOVO_IP`.
2. Transfere apenas `.certs/My-Music-CA.crt` para o iPhone por um canal pessoal de confiança. Abre-o e instala em **Definições → Geral → VPN e gestão de dispositivos**. Depois ativa a CA em **Geral → Informações → Definições de confiança dos certificados**, conforme a [Apple](https://support.apple.com/en-us/102390). Nunca transfiras as chaves privadas.
3. Para desenvolvimento: `npm run dev`. Para a aplicação offline: `npm run build` e `npm run preview`. Ambos usam **https://192.168.1.136:5173**, mantendo a mesma origem. Usa a mesma rede Wi-Fi e permite acesso à porta 5173 na rede privada do Windows, se solicitado. Encerra o servidor anterior antes de mudar entre dev e preview.
4. Abre o endereço no Safari depois de confiar no certificado; não ignores avisos TLS. Para offline, usa o preview, espera por **Definições → Disponível offline**, adiciona ao ecrã principal e verifica em modo avião.

HTTP e HTTPS são origens distintas. Os dados antigos continuam na origem HTTP; não são transferidos automaticamente. Antes da mudança, exporta a biblioteca em Definições na origem antiga. Se necessário, inicia temporariamente o servidor HTTP com `$env:MY_MUSIC_HTTP="1"; npm run dev`; depois encerra-o e executa `Remove-Item Env:MY_MUSIC_HTTP` antes de voltar a HTTPS. O backup atual permite extrair/reimportar o áudio; não existe restauro automático de playlists, favoritos, letras ou preferências entre origens. Não apagues os dados antigos. O esquema IndexedDB permanece na versão 2.

Os certificados e chaves ficam em `.certs/`, ignorada e fora de `public/` e `dist/`. O Safari requer confiança manual no iPhone. Não houve teste físico no iPhone; reprodução em segundo plano e gestão de armazenamento do iOS dependem do dispositivo.

## Verificações

```powershell
npm test
npm run lint
npm run build
npm run test:e2e
```

Os testes unitários usam Vitest e fake-indexeddb: persistência, duplicados, remoção, rollback por quota, validação de ficheiros, ciclo de vida do áudio e temas. O teste E2E utiliza o Microsoft Edge instalado no Windows, inicia um servidor preview e verifica um WAV sintético criado em memória, importação, reprodução, persistência, exportação, layout móvel e funcionamento offline. Requer um build recente e Edge instalado; não equivale a teste no Safari/iPhone.

## Organização

Validação original da V1: 11 testes unitários aprovados, teste integrado no Microsoft Edge aprovado, ESLint sem erros e build de produção concluído. O teste integrado compara os bytes do ficheiro exportado e do áudio no backup ZIP, além de verificar o catálogo e a reprodução depois de recarregar sem rede. O layout foi inspecionado em desktop e a 414 × 896; não houve teste num iPhone físico. A partilha nativa foi testada com API simulada; o download alternativo foi testado no Edge.

- `src/domain/`: tipos, validação, formatação e definição dos temas.
- `src/services/`: transações IndexedDB, leitura de áudio, exportação individual e backup ZIP.
- `src/hooks/`: consulta reativa e ciclo de vida do reprodutor.
- `src/components/`: componentes reutilizáveis de apresentação.
- `src/App.tsx`: navegação, composição das páginas e operações da interface.
- `vite.config.ts`: Tailwind, manifesto, precache e HTTPS local opcional.
- `tests/`: testes unitários; `e2e/`: testes de navegador.

## Próximas etapas

V1 e V2 implementadas. Leitura e edição de metadados e capas reais continuam na V3. Pesquisa online e downloads autorizados ficam para a V4; backend Python e processamento de áudio não foram acrescentados. O único endpoint externo da V2 é a pesquisa opcional de letras LRCLIB.

Documentação consultada: [Dexie](https://dexie.org/docs/Table/Table), [Vite PWA](https://vite-pwa-org.netlify.app/guide/), [Tailwind com Vite](https://tailwindcss.com/docs/installation/using-vite) e [mkcert](https://github.com/FiloSottile/mkcert).




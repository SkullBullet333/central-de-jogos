# Central de Jogos

## Teste local do bingo em sala

Use Node.js 22 ou superior. Execute `npm ci` no primeiro uso, depois `npm run dev`. Abra `http://localhost:3000/bingo.html`, escolha **Apresentar bingo com participantes** e crie uma sala. Sem credenciais Redis, o servidor de desenvolvimento mantém as salas em memória até reiniciar.

Para simular dois participantes, abra o convite em dois perfis diferentes de navegador. O mesmo perfil recupera a cartela já atribuída. Para testar no celular, execute `npm run dev -- --hostname 0.0.0.0` e abra a página principal pelo IP do computador na mesma rede antes de gerar o QR. Um convite com localhost só funciona no próprio computador.

O apresentador compartilha apenas o convite. O controle da sala pertence ao navegador que a criou. Guarde o armazenamento desse navegador durante o evento. As inscrições fecham na primeira pedra. A troca de quina para cheia pode ser manual ou automática. As cartelas permanecem iguais nas duas fases. O painel atualiza aproximadamente a cada quatro segundos e lista todos os ganhadores na mesma pedra.

## Publicar depois no GitHub e na Vercel

1. Envie o projeto para o seu repositório no GitHub. Este checkout pode já ter um remoto de publicação do Sites. Confira com `git remote -v` e adicione o GitHub como um remoto separado. Nunca envie arquivos .env com credenciais.
2. Na Vercel, importe esse repositório, selecione Next.js, use a raiz do projeto e mantenha os comandos padrão. Use a saída padrão do Next.js. O modo de salas requer a rota de servidor `/api/bingo/`.
3. Conecte um banco Upstash Redis ao projeto e configure `UPSTASH_REDIS_REST_URL` e `UPSTASH_REDIS_REST_TOKEN`. Os nomes `KV_REST_API_URL` e `KV_REST_API_TOKEN` também são aceitos. Use credenciais de escrita e mantenha-as somente no servidor. Para testar previews isolados, conecte um banco separado nesse ambiente.
4. Faça um deploy após configurar as variáveis. Pelo domínio definitivo, crie a sala e teste o convite em outro navegador antes do evento. O acesso do participante deve abrir diretamente o formulário de nome.
5. Para verificar o código localmente, execute `node --test tests/*.test.mjs` e `npm run build`. Para testar a versão de produção local, preencha as variáveis no .env.local antes de executar `npm start`.

Cada sala no Redis expira sete dias depois da última alteração. O modo clássico continua disponível em bingo.html, inclusive offline. A publicação antiga no Sites é estática e independente da nova hospedagem.

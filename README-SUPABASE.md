# BORA de Açaí — Supabase

Projeto Supabase criado: `bora-de-acai`

- Project ref: `kqgcdwiqoytdfjpdlkhn`
- Região: South America (São Paulo) — `sa-east-1`
- URL: `https://kqgcdwiqoytdfjpdlkhn.supabase.co`
- Chave no frontend: publishable key (`sb_publishable_...`). Nunca coloque `service_role` ou secret key no navegador.

## Banco já provisionado

A migração `create_bora_acai_store_schema` foi aplicada e verificada. Tabelas: `store_settings`, `categories`, `products`, `addons`, `product_addons`, `coupons` e `orders`. O bucket público `product-images` também foi criado, limitado a imagens JPEG, PNG e WebP de até 5 MB.

Todas as tabelas têm RLS. Visitantes podem ler o catálogo ativo e criar pedidos. Ações administrativas exigem usuário autenticado com `app_metadata.role = admin`.

## Ativar o usuário administrador

1. No Supabase, abra **Authentication → Users** e crie/invite o usuário com o e-mail que será usado no painel.
2. Abra o usuário criado e edite **Raw App Meta Data** para conter exatamente:

   ```json
   { "role": "admin" }
   ```

3. Desative inscrições públicas em **Authentication → Providers → Email** (ou configure o projeto para aceitar apenas usuários criados pelo administrador).
4. Saia e entre novamente no painel para receber um token atualizado com a permissão de administrador.

Não use `user_metadata` para conceder acesso administrativo. A autorização usa `app_metadata`, que não pode ser alterado pelo próprio usuário.

## Rodar o site

O arquivo `.env` já está preenchido com a URL do projeto e a chave pública. Instale as dependências e execute:

```bash
npm install
npm run dev
```

A chave publishable/anon é pública por definição e está protegida por RLS. Não adicione chaves `service_role` ou secret ao `.env` do frontend.

## Próxima etapa de produto

A estrutura e as funções de acesso ao catálogo estão preparadas no código (`src/lib/cloud.ts`). A interface atual do painel ainda precisa receber as telas de cadastro/edição de produtos, categorias e adicionais e a migração dos dados iniciais do catálogo local para as tabelas.

## Fase 2 — catálogo editável

No painel administrativo, abra a aba **Cardápio**.

1. Na primeira utilização, clique em **Importar cardápio inicial do site** para copiar as categorias e os produtos de demonstração para o banco. A importação não apaga os produtos já existentes.
2. Depois, cadastre novas categorias e produtos, edite nome, descrição, preço, categoria e imagem, ou pause/exclua produtos.
3. Imagens podem ser enviadas em JPG, PNG ou WebP (até 5 MB) para o bucket público `product-images`.
4. O cardápio público passa a ler os produtos ativos do Supabase. Se o banco ainda estiver vazio, o site mantém o cardápio local de demonstração.

Atenção: produtos com tamanhos/opções especiais preservam as opções quando são importados. A edição simples do formulário altera nome, descrição, preço base, categoria e imagem; a edição detalhada de tamanhos e adicionais será uma próxima melhoria.


## Fase 3 — gerenciamento de pedidos
- Os pedidos do checkout são gravados na tabela `orders` antes de abrir o WhatsApp.
- O painel administrativo ganhou a aba **Pedidos**, com filtros, detalhes do cliente, itens, valores e atualização do status.
- A lista atualiza automaticamente a cada 20 segundos e também pode ser atualizada manualmente.
- A coluna `customer_details` guarda dados de pagamento e agendamento. A migração correspondente está em `supabase/migrations/202611100001_add_order_customer_details.sql`.
- Os pedidos são visíveis e editáveis apenas para administradores, conforme as políticas RLS existentes.


**Validação desta entrega:** a sintaxe TS/TSX foi validada. A compilação completa não foi concluída neste ambiente porque a instalação das dependências (`npm ci`) excedeu o tempo limite; execute `npm ci` e `npm run build` no computador de desenvolvimento antes de publicar.

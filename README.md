# Minha Biblioteca - Catálogo de livros por foto

Aplicação web para cadastrar livros por foto da capa, usando AWS Cognito, API Gateway, Lambda, S3, Rekognition e DynamoDB.

## Estrutura

```text
book-inventory-aws/
├── backend/
│   ├── template.yaml
│   └── src/
│       ├── handlers.py
│       ├── book_parser.py
│       └── requirements.txt
├── frontend/
│   ├── index.html
│   ├── package.json
│   ├── .env.example
│   └── src/
│       ├── main.jsx
│       ├── App.jsx
│       └── index.css
├── amplify.yml
├── .gitignore
└── README.md
```

## 1. Deploy do backend

```bash
cd backend
sam build
sam deploy --guided
```

Sugestões para o guided deploy:

```text
Stack Name: book-inventory
Region: sa-east-1
Confirm changes before deploy: Y
Allow SAM CLI IAM role creation: Y
Save arguments to configuration file: Y
```

Depois do deploy, pegue os outputs:

```bash
sam list stack-outputs --stack-name book-inventory --region sa-east-1
```

Você precisa de:

```text
ApiUrl
UserPoolId
UserPoolClientId
CoversBucketName
```

## 2. Configurar frontend local

```bash
cd ../frontend
cp .env.example .env
```

Edite o `.env` com os outputs reais:

```env
VITE_API_URL=https://SUA_API.execute-api.sa-east-1.amazonaws.com
VITE_USER_POOL_ID=sa-east-1_xxxxxxxxx
VITE_USER_POOL_CLIENT_ID=xxxxxxxxxxxxxxxxxxxxxxxxxx
```

Instale dependências e rode:

```bash
npm install
npm run dev
```

## 3. Publicar no Amplify

No AWS Amplify Hosting, use:

- Repositório GitHub com este projeto
- App root: `frontend`
- Build settings: arquivo `amplify.yml`
- Variáveis de ambiente:

```env
VITE_API_URL=https://SUA_API.execute-api.sa-east-1.amazonaws.com
VITE_USER_POOL_ID=sa-east-1_xxxxxxxxx
VITE_USER_POOL_CLIENT_ID=xxxxxxxxxxxxxxxxxxxxxxxxxx
```

Depois de alterar variáveis no Amplify, faça redeploy.

## 4. Criar usuários

O cadastro público está bloqueado no Cognito (`AllowAdminCreateUserOnly: true`).

Para criar usuário:

1. AWS Console > Cognito
2. User Pool `book-users`
3. Users
4. Create user
5. Informe e-mail e senha temporária

## 5. Diagnóstico do upload da capa

O frontend mostra a etapa em que falhou:

- Etapa 1: chamada API `/books/upload-url`
- Etapa 2: upload PUT para S3
- Etapa 3: chamada API `/books/scan` e Rekognition
- Etapa 4: sucesso

## 6. Testes úteis

API online:

```bash
curl -i https://38sbaf12qb.execute-api.sa-east-1.amazonaws.com/books
```

CORS API para Amplify:

```bash
curl -i -X OPTIONS \
  https://38sbaf12qb.execute-api.sa-east-1.amazonaws.com/books/upload-url \
  -H "Origin: https://main.d1hfu19yup9flj.amplifyapp.com" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: authorization,content-type"
```

CORS S3:

```bash
aws s3api get-bucket-cors \
  --bucket SEU_BUCKET_DE_CAPAS \
  --region sa-east-1
```

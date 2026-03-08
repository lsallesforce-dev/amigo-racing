import https from 'https';

const PAGARME_API_KEY = process.env.PAGARME_API_KEY;
const PAGARME_API_URL = process.env.PAGARME_API_URL || 'https://api.pagar.me/core/v5';

if (!PAGARME_API_KEY || !PAGARME_API_URL) {
  console.error('❌ PAGARME_API_KEY ou PAGARME_API_URL não configurados');
  process.exit(1);
}

const authHeader = `Basic ${Buffer.from(`${PAGARME_API_KEY}:`).toString('base64')}`;

// Dados do Lucas Salles com campos obrigatórios
const recipientData = {
  code: `rec_lucas_${Date.now()}`,
  payment_mode: 'bank_transfer',
  automatic_anticipation_settings: {
    enabled: false,
  },
  register_information: {
    type: 'individual',
    name: 'Lucas Salles',
    email: 'lsallesforce@gmail.com',
    document: '93766747070',
    birthdate: '22/10/1981',
    monthly_income: 5000,
    professional_occupation: 'Piloto',
    address: {
      street: 'Rua Teste',
      street_number: '123',
      complementary: 'Apt 456',
      reference_point: 'Perto da praça',
      neighborhood: 'Centro',
      city: 'São José do Rio Preto',
      state: 'SP',
      zip_code: '15015110',
      country_code: 'BR',
    },
    phone_numbers: [
      {
        country_code: '55',
        ddd: '17',
        number: '991141010',
        type: 'mobile',
      },
    ],
  },
  default_bank_account: {
    holder_name: 'Lucas Salles',
    holder_type: 'individual',
    holder_document: '93766747070',
    bank: '001',
    branch_number: '0001',
    branch_check_digit: '0',
    account_number: '12345678',
    account_check_digit: '9',
    type: 'checking',
  },
  transfer_settings: {
    transfer_enabled: true,
    transfer_interval: 'daily',
    transfer_day: 0,
  },
};

console.log('📝 Criando recipient no Pagar.me...');
console.log('Dados:', JSON.stringify(recipientData, null, 2));

fetch(`${PAGARME_API_URL}/recipients`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': authHeader,
  },
  body: JSON.stringify(recipientData),
})
  .then(res => res.json())
  .then(data => {
    console.log('\n✅ Resposta do Pagar.me:');
    console.log(JSON.stringify(data, null, 2));
    
    if (data.id) {
      console.log(`\n🎉 Recipient criado com sucesso!`);
      console.log(`📌 Recipient ID: ${data.id}`);
      console.log(`\nExecute o comando abaixo para salvar no banco:`);
      console.log(`UPDATE users SET recipientId = '${data.id}' WHERE email = 'lsallesforce@gmail.com';`);
    } else if (data.errors) {
      console.error('\n❌ Erro ao criar recipient:');
      if (typeof data.errors === 'object' && !Array.isArray(data.errors)) {
        Object.entries(data.errors).forEach(([key, value]) => {
          console.error(`  ${key}: ${Array.isArray(value) ? value.join(', ') : value}`);
        });
      } else if (Array.isArray(data.errors)) {
        data.errors.forEach((err, i) => {
          console.error(`  ${i + 1}. ${err.parameter}: ${err.message}`);
        });
      }
    }
  })
  .catch(err => {
    console.error('❌ Erro na requisição:', err);
  });

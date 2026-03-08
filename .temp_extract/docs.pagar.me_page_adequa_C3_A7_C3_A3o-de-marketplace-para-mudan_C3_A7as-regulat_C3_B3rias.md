# Adequação de Marketplace para Mudanças Regulatórias

**URL:** https://docs.pagar.me/page/adequa%C3%A7%C3%A3o-de-marketplace-para-mudan%C3%A7as-regulat%C3%B3rias

---

Jump to Content
Guides
Suporte
API Reference
V5 (2021-09-01)
Adequação de Marketplace para Mudanças Regulatórias
Search
CTRL-K
Adequação de Marketplace para Mudanças Regulatórias
📘

Prazo de regularização!

O novo contrato para a criação de recebedores entrou em vigor em 29 de fevereiro de 2024. Os prazos para adequação de todo o conteúdo disposto nesta documentação estão descritos nos respectivos links.

Clientes credenciados após 29 de fevereiro de 2024 já devem realizar sua integração conforme disposto nessa documentação.

A partir de 2024, as regras e exigências para cadastro de recebedor dos marketplaces da Pagar.me vão mudar, para que nossa integração seja mais segura e adequada as mais recentes normas e regulações do BACEN e Bandeiras.

🚧

Atenção!

Nas documentações e APIs Pagar.me a entidade seller é referida como recebedor. Trata-se da mesma entidade.

👍

Versões de integração v1 a v4

Todas as nossas versões entre v1 e v4 são retro compatíveis, ou seja, todas as alterações realizamos para a versão V4 de integração estarão também disponíveis nas demais versões, seguindo o mesmo contrato e obrigatoriedades.

👍

SDK's

As versões mais recentes de nossas SDK's já estão atualizadas com os novos Dados Mínimos de Cadastro e Validação de Identidade. Para clientes que utilizam uma de nossas SDK's será necessário:

v1 a v3: fazer a migração para a v4 ou v5.

v4 ou v5: atualizar seu ambiente para a nova versão.

[v5] SDK's
[v4] SDK's

Os principais tópicos impactados nos nossos fluxos são:

1 - Dados Mínimos de Cadastro

2 - Validação de Identidade

3 - Conta Digital Pagar.me

4 - Conciliação: Novas rotas e mudanças em Balance Operaions

5 - Resolução 264/346: Interface para Recebedor

1 - Dados Mínimos de Cadastro
Compliance com a Circular 3.978/20 do Banco Central

Com objetivo de atender as diretrizes dispostas na circular sobre os procedimentos a serem adotados para prevenção à lavagem de dinheiro e financiamento ao terrorismo é imprescindível o envio de dados mínimos de cadastro para os recebedores dos marketplaces.

Com isso fizemos alguns ajustes no nosso contrato de criação e atualização de recebedores e detalhamos as mudanças necessárias para cada versão da nossa API, nas páginas:

[v5] Mudanças para dados mínimos
[v4] Mudanças para dados mínimos
❗️

Aviso

O envio do novo contrato de dados mínimos é uma etapa obrigatória na criação de novos recebedores.

2 - Validação de Identidade
Compliance com a Circular 3.978/20 do Banco Central

Tanto para atender as diretrizes do BACEN quanto para fortalecer a segurança e capacidade de prevenção a fraude da nossa plataforma, introduziremos a Validação de Identidade com Prova de Vida (KYC) como obrigatória também para os recebedores de marketplaces.*

Com o objetivo de facilitar a adaptação no novo processo de Validação de Identidade, disponibilizaremos uma webapp em que os recebedores poderão passar pelo processo de KYC com biometria.

Simulador de KYC

No fluxo de criação de um recebedor, será disponibilizado um QR Code de acesso ao webapp, que deverá ser renderizado pelo Marketplace e disponibilizado para que o recebedor finalize seu processo de credenciamento.

Para o detalhamento das mudanças, fluxos e contratos de API sobre o novo fluxo de Validação de Identidade com Prova de Vida, acesse as páginas abaixo:

[v5] Mudanças para Validação de Identidade com Prova de Vida
[v4] Mudanças para Validação de Identidade com Prova de Vida
❗️

Aviso

*Para a Validação de Identidade, verifique as condições do seu cadastro. Em caso de dúvidas, entre em contato com o departamento de relacionamento@pagar.me .

3 - Conta Digital Pagar.me

Na Pagar.me sempre buscamos novas ferramentas e benefícios para aprimorar a experiência dos nossos clientes. Com isso apresentamos a Conta Digital Pagar.me vinculada a instituição de pagamento Stone Pagamentos S/A, um novo serviço de recebíveis inteiramente gratuito regulado pelo Banco Central do Brasil (BACEN). A conta será aberta de forma automática para cada recebedor.

A Conta Digital visa trazer mais segurança aos clientes, assim como agilidade no recebimento dos seus pagamentos de forma regulada pelo BACEN. O saldo disponível de cada recebedor ficará nessa conta até ser efetuado um saque ou uma transferência para a conta de domicílio bancário cadastrada.

Lembramos que para que seja possível a movimentação financeira no novo modelo, haverá a necessidade de complementação dos dados mínimos obrigatórios e a validação de identidade citados acima.

Esta mudança será feita de forma automática pela Pagar.me desde que o marketplace se adapte a Validação de Identidade e aos Dados Mínimos de Cadastro descritos acima.

É importante entender em detalhes as novas normas e realizar os ajustes necessários, acesse aqui o artigo completo na nossa documentação.

❗️

Aviso

Para a Conta Digital Pagarme, verifique as condições do seu cadastro. Em caso de dúvidas, entre em contato com o departamento de relacionamento@pagar.me .

4 - Conciliação

Com o intuito de sempre prover a melhor experiência na conciliação dos recebíveis, estamos realizando em nossas APIs de conciliação todas as adaptações necessárias para adequação as mudanças regulatórias.

A mudança para a conta Digital Pagar.me irá acarretar em uma mudança de fluxo de conciliação da entidade balance operations de nossa API. Clientes que realizam conciliação utilizando as rotas de Operações de Saldo irão precisar se adaptar ao novo objeto. Os objetos atuais não irão sofrer mudança de contratos, somente iremos adicionar um novo objeto para permitir a conciliação no novo formato de conta Pagar.me.

Para detalhamento da mudanças realizadas nas APIs de conciliação acesse as páginas abaixo:

[v5] Mudanças no fluxo de Conciliação
[v4] Mudanças no fluxo de Conciliação
❗️

Aviso

Para a Conciliação, verifique as condições do seu cadastro. Em caso de dúvidas, entre em contato com o departamento de relacionamento@pagar.me .

5 - Resolução 264/346
Interface para Recebedores
📘

Prazo de regularização!

O BCB pede que todos os comandos contidos nos artigos 13 da Resolução 264 estejam implementados até o dia 01 de abril de 2024.

De acordo com a Resolução 264, Artigo 13, do Banco Central, será necessário fornecer uma interface eletrônica aos proprietários dos recebíveis, neste caso, os seus recebedores. Essa interface deverá conter informações sobre agenda, contratos e a possibilidade de contestação. Abaixo iremos detalhar.

Compreendemos que, na prática, seus recebedores muitas vezes não estão familiarizados com a Pagar.me. Por isso, pensando em garantir a melhor experiência para eles, é fundamental que vocês atuem como intermediários, fornecendo as informações obrigatórias de acordo com as normas para os recebedores.

A norma não especifica um local exato, como acontece no caso do PIX. Portanto, a decisão sobre onde e como exibir essas informações, em qual tela e formato fica a seu critério. Se considerarem mais apropriado para o seu negócio, vocês podem executar esse processo sob demanda. A única exigência é que as informações estejam acessíveis caso o cliente solicite.

Para detalhamento das integração necessarias e dúvidas(FAQ) acesse a páginas abaixo:

Res.264/346: Manual de Integração﻿

FAQ
Como as mudanças afetam a base legada de recebedores de marketplaces?

Neste momento, não será necessário ajustar a base legada de recebedores. É necessário realizar a adequação na criação de novos recebedores. O ajuste da base existente será feita em um segundo momento a ser comunicado.

Quais documentos devem ser apresentados por estrangeiros na validação de identidade?

Clientes estrangeiros podem apresentar a Carteira de Registro Nacional Migratório (CRNM) ou Registro Nacional de Estrangeiros (RNE).

Como o cliente que está acessando a validação de identidade pelo celular vai poder fazer a leitura do QR Code?

Na tela do QR Code, existe um botão Tirar as fotos nesse dispositivo, que direciona o cliente para as telas de biometria no navegador. Os clientes que atuam como marketplace precisam fazer esse desenvolvimento para ser apresentado aos recebedores.

Quantas vezes o marketplace pode gerar um QR Code?

Não há limite para geração de QR Code.

Por quanto tempo o QR Code fica disponível para o seller?

O QR Code fica disponível por 20 minutos. Depois disso, o marketplace precisa gerar um novo QR Code

Qual a quantidade de tentativas que podem ser feitas com um QR Code?

3 fluxos completos que gerem análise de KYC.

O que fazer com as transações de um recebedor reprovado após a análise?

Mediante a informação da reprovação do recebedor, o marketplace tem a opção de cancelar as transações ou realizar um saque em nome do mesmo titular do recebedor. É importante destacar que, em situações específicas, pode ser necessário reter os fundos temporariamente para análise.

Como repassamos o motivo de recusa da validação de identidade?

Por conta da LGPD, o marketplace receberá apenas o status final (aprovado, recusado ou refazer). Para isso, deve utilizar o webhook de recipient.updated.

Qual a relação entre a obrigatoriedade da DESIF e a isenção da emissão de nota fiscal de saque e pix?

Com a nova Conta, as taxas de Saque e Pix representam receitas integralmente da Stone. De acordo com as regulamentações da prefeitura de São Paulo, que estabelecem a obrigatoriedade da DESIF, a Stone não precisa mais emitir notas fiscais (NF). Portanto, desde fevereiro de 2023, a Stone não emite mais notas fiscais, incluindo Notas Fiscais de Saque e Pix.

Os clientes vão ter acesso a serviços bancários como Pix e pagamento de boletos com o saldo da conta digital?

Neste momento, ainda não vai ser possível. Mas, esperamos oferecer estes serviços em breve.

Quais são os documentos complementares que podem ser solicitados durante a validação de identidade?

O Contrato Social (ou CCMEI no caso de MEI) e/ou Procuração podem ser solicitados.

Com as mudanças, os recebedores passam a ter um dashboard própria?

Não, a dash continua disponível apenas para o marketplace, responsável por prover as informações aos recebedores.

A validação do documento e da foto é feita na hora ou temos um prazo para a validar?

Disponibilizamos um prazo de até 24 horas para realizar as validações necessárias. Esse tempo é necessário para conduzir uma série de verificações que asseguram a integridade dos dados e os vínculos legais. A análise pode ser concluída rapidamente caso não existam pendências; no entanto, pode estender-se até o limite de 24 horas se houver dificuldades em comprovar o vínculo com o representante legal, demandando um exame mais detalhado.

O que acontece quando um cliente possui recebedores com um mesmo CNPJ?

Por enquanto, não serão feitas mudanças na base legada, pois o foco inicial está em realizar as adequações para não ser possível criação de novos recebedores com mesmo documento. Após isso, procederemos com o ajuste da base legada.

Como ficam as plataformas parceiras que usam split de pagamento?

Essas plataformas não são desenvolvidas por nossa equipe e precisam se adaptar até o prazo estabelecido. Recomendamos que o cliente entre em contato com a sua plataforma para verificar o andamento das adequações.

Quais informações podem ser solicitadas ou corrigidas via Webapp?

Em caso de problemas nos dados enviados ou em caso de não ser possível validação, os dados abaixo poderão ser solicitado e corrigidos via webapp:
Selfie
Contrato Social
Procuração
Documento (RG, CNH, Passaporte e CTPS)
Ocupação
Faturamento
Renda
Endereço Residencial
Endereço Comercial
Data de nascimento
E-mail
Telefone

Lembramos que nossa equipe de atendimento está à disposição para fornecer suporte e esclarecer eventuais dúvidas durante esse processo. É só acionar um de nossos canais de atendimento que você usa normalmente.

Chat: Localizado no canto inferior direito do painel do Pagar.me.
E-mail: relacionamento@pagar.me
Telefone: 4004-1330
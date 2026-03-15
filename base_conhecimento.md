Como Analista de Sistemas e Especialista em Rally, estruturei o relatório solicitado com base no "Kraken Rally Playbook" (transcrições e manuais do aplicativo). O conteúdo foi formatado de maneira limpa e hierárquica, ideal para ser convertido em Markdown ou JSON e ingerido por um Agente de IA.

***

# Relatório Estruturado: Base de Conhecimento Kraken Rally

## 1. Glossário Técnico
*   **Tulipa:** Desenhos esquemáticos na planilha que representam, da forma mais fiel possível, o cenário à frente e indicam a direção a ser tomada (ex: uma bolinha indica a posição do carro e a seta a direção).
*   **PC (Posto de Controle):** Pontos virtuais criados por GPS de forma secreta pela organização. Servem para medir a exatidão temporal do competidor em relação ao tempo ideal da prova.
*   **Datalogger:** Arquivo que registra todo o caminho percorrido, tempo e velocidade da equipe. Deve ser enviado à organização via app no final da prova para a apuração dos resultados.
*   **Odômetro (Odo):** Marcador que mostra a distância acumulada percorrida. O aplicativo possui um Odo principal progressivo e permite a exibição de Odo parcial, e também possibilita a ocultação da terceira casa decimal.
*   **Botoeira:** Controle de hardware externo conectado ao app que agiliza a navegação. Pode ter botões configurados para incremento/decremento de metragem, acionamento da função "Estou aqui" (para pular ou voltar referências) e botão secundário para cancelar ou fazer o ajuste fino do W%.
*   **T-Nave (Tempo de Navegação):** Indicador temporal no painel de controle que mostra a diferença entre o tempo real e o ideal. Fundo vermelho com sinal negativo indica adiantamento; fundo verde com sinal positivo indica atraso.
*   **Trechos de Prova:**
    *   **Deslocamento (D):** Trecho com tempo/distância determinados para deslocamento livre, sem penalização por PCs.
    *   **Velocidade (V):** Trecho onde se deve manter uma média horária específica e onde estão escondidos os PCs.
    *   **Neutralizado (N):** Trecho onde o competidor deve ficar parado por um tempo específico, sendo útil para recuperar atrasos.

## 2. Lógica de Pontuação e Regras
*   **Objetivo Principal (Exatidão Temporal):** No rally de regularidade não ganha quem é mais rápido ou corajoso, mas sim quem é mais preciso no tempo e trajeto predeterminados. O objetivo é manter o T-Nave no zero ou o mais próximo possível dele.
*   **Penalizações nos PCs:** A performance é aferida nos Postos de Controle, onde se compara o horário real de passagem com o horário ideal. 
    *   **Atraso:** Passar depois do tempo gera pontos de penalização (ex: 2 segundos de atraso = 2 pontos).
    *   **Adiantamento:** Passar antes do tempo também gera penalização (ex: passar 2 segundos adiantado = 2 pontos).
*   **Vencedor:** Ganha a prova quem acumular a menor quantidade de pontos perdidos ao final do trajeto.

## 3. Guia de Configuração de Hardware/Software
**Passo a Passo de Configuração do App Kraken:**
1.  Baixar o aplicativo Kraken Rally e cadastrar um e-mail válido.
2.  Informar o e-mail cadastrado à organização para liberação da prova.
3.  Fazer login, selecionar o evento liberado e clicar em "Iniciar Prova".
4.  Optar pela modalidade "Planilha Digital" e confirmar o horário de largada (se não houver orientação contrária da direção de prova).
5.  **Permissões Críticas:** Aceitar todas as permissões do checklist: "Permitir localização o tempo todo" e "Ignorar otimização de bateria" (fundamental para o app não parar em segundo plano).
6.  Selecionar a função na prova: Navegador ou Piloto.

**Uso das Telas (Piloto vs. Navegador):**
*   **Tela do Navegador:** Contém o roadbook completo (tulipas, odômetro, tempo, T-Nave e observações). O navegador detém o controle e faz as correções de hodômetro.
*   **Tela do Piloto (Slave):** Mostra uma versão simplificada contendo apenas os dados cruciais enviados pelo aparelho do navegador: odômetro, T-Nave, velocidade instantânea e média horária. Pode ser personalizada (layout horizontal/vertical, remover ou adicionar widgets).

**Função da Botoeira:**
*   Acessada via Menu de Configurações > Botoeira.
*   Permite configurar o salto de incremento/decremento de metragem (ex: pular 1m ou 10m).
*   O botão OK (principal) pode ser usado como atalho para o "Estou aqui" (ajuste na referência visual) e avanço de tulipa.
*   O botão secundário serve para cancelar operações ou realizar "ajuste fino do W%" (ajuste no cálculo de odômetro).

## 4. Protocolos de Erro (Troubleshooting)
*   **Erro de Navegação (Trajeto Errado):** Diferente de apps como Waze, o Kraken não recalcula a rota sozinho. Se a equipe sair do trajeto, deve retornar com segurança para a última tulipa/referência em que tinham certeza da localização. Lá, o navegador clica e segura na tela para usar a função "Estou aqui" (seletor de tulipa) e forçar o app a voltar para a referência correta, recalculando instantaneamente o atraso gerado.
*   **Erro de Metragem (Atraso/Adiantamento Físico):** Se a dupla chegar na referência (ex: uma árvore) e o odômetro estiver marcando metros a mais ou a menos, o navegador deve corrigir. Isso pode ser feito usando botões de +10m/-10m ou, preferencialmente, pressionando a tela para acionar a setinha azul (Estou aqui) e cravar o odômetro na medida exata exigida.
*   **Envio de Resultados:** Ao terminar a prova, deve-se fechar a planilha no menu. A equipe é obrigada a acessar a aba de Dataloggers e clicar em "Enviar Datalogger" para que a organização receba os logs de rotação. Se houver falha (ex: status "0 de 178 sincronizado"), a prova não será apurada.

## 5. Base de Perguntas Frequentes (FAQ)

**Q1: O aplicativo Kraken Rally corrige minha rota caso eu entre na rua errada?**
R: Não. O aplicativo não traça novas rotas como o GPS de rua convencional. Cabe ao navegador identificar o erro, solicitar o retorno seguro ao último ponto conhecido e reposicionar a equipe usando a função "Estou aqui".

**Q2: O que significa quando o T-Nave está com número negativo e tela vermelha?**
R: Significa que você está adiantado em relação ao tempo ideal. A instrução imediata é "acelere menos" para que o tempo volte a se aproximar do zero.

**Q3: O que significa quando o T-Nave está com número positivo e tela verde?**
R: Significa que a equipe está atrasada em relação à planilha. A instrução é "acelere mais" para recuperar o tempo perdido.

**Q4: Posso sofrer penalização nos trechos de Deslocamento ou Neutro?**
R: Não, pois a organização posiciona os PCs (Postos de Controle) secretamente apenas dentro dos trechos marcados como Velocidade (V). No entanto, cumpra o tempo do Neutro adequadamente para não largar atrasado no trecho seguinte.

**Q5: Para que serve o trecho "Neutro"?**
R: É um tempo de parada obrigatória em um ponto específico. Ele serve tanto para segurança/descanso quanto para que competidores que se perderam possam utilizar essa janela de tempo para abater seus atrasos e voltar à prova no horário certo.

**Q6: Como eu altero o piloto e o navegador no aplicativo?**
R: Na tela inicial, antes de abrir a planilha digital, o app pede para você confirmar se será piloto ou navegador. Também é possível alterar em "Configurações" através da opção "Tipo de equipamento".

**Q7: O odômetro do aplicativo bateu a quilometragem, mas não estou do lado da referência visual exigida. O que faço?**
R: Você deve alinhar fisicamente seu veículo (ombro do piloto/navegador) com a referência real (ex: uma placa). Depois, ajuste o aplicativo pressionando e segurando a tela (Estou aqui) ou utilizando a botoeira para zerar o odômetro ou ajustar a diferença de metros.

**Q8: Por que o aplicativo exige que eu desative a otimização de bateria do celular?**
R: O Kraken Rally precisa usar o GPS de forma constante em segundo plano. Se a otimização estiver ligada, o sistema do aparelho pode "matar" o app, corrompendo o registro do seu trajeto (Datalogger) e prejudicando os resultados.

**Q9: O que é a Aferição Visual?**
R: É um recurso disponível no menu que permite ajustar finamente o fator do Odo (W) na marcha da prova. Caso chegue adiantado ou atrasado em relação a uma medida de aferição, você pode inserir o ajuste métrico corretivo e confirmar pela tela ou botoeira para alterar sua calibração para o resto do trajeto.

**Q10: O que devo fazer logo após cruzar a linha de chegada?**
R: Primeiro, acesse as configurações e clique em "Fechar Planilha". Em seguida, vá ao menu principal do evento, entre em "Dataloggers" e certifique-se de clicar em enviar o seu arquivo para que a organização calcule seus pontos.
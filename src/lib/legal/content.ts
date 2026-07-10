/**
 * Conteúdo legal (Termos de Uso + Política de Privacidade) — Sprint 11 (LGPD).
 *
 * ⚠️ RASCUNHO gerado para uma clínica de saúde sob a LGPD (Lei 13.709/2018).
 * REVISAR COM ADVOGADO antes de considerar válido. Trechos `[A PREENCHER: ...]`
 * dependem de dados do operador (razão social, CNPJ quando houver, e-mail do
 * encarregado/DPO, endereço).
 *
 * `LEGAL_VERSION` é a fonte única da versão consentida — o registro grava
 * exatamente esta string em `User.termsVersion`, e as páginas exibem
 * `LEGAL_UPDATED_LABEL`. Ao mudar o texto de forma material, BUMPe a versão.
 */

export const LEGAL_VERSION = "2026-07-10";
export const LEGAL_UPDATED_LABEL = "10 de julho de 2026";

/** Marcadores que o operador deve preencher antes de publicar de verdade. */
export const CONTROLLER_NAME = "[A PREENCHER: razão social / nome do responsável]";
export const CONTROLLER_DOC = "[A PREENCHER: CPF/CNPJ quando disponível]";
export const DPO_EMAIL = "[A PREENCHER: e-mail do encarregado (DPO)]";

export type LegalSection = { heading: string; paragraphs: string[] };

export const TERMS_SECTIONS: LegalSection[] = [
  {
    heading: "1. Aceitação",
    paragraphs: [
      "Ao criar uma conta e usar a Clínica Organizada (\"Serviço\"), você concorda com estes Termos de Uso e com a Política de Privacidade. Se você não concorda, não utilize o Serviço.",
      "O Serviço é operado por " + CONTROLLER_NAME + " (" + CONTROLLER_DOC + ").",
    ],
  },
  {
    heading: "2. O que o Serviço faz",
    paragraphs: [
      "A Clínica Organizada ajuda profissionais e estabelecimentos de saúde e bem-estar a gerenciar agendamentos, cadastrar pacientes e enviar confirmações e lembretes automáticos por WhatsApp, reduzindo faltas (no-shows).",
      "O envio de mensagens depende de uma conexão ativa de WhatsApp do próprio usuário, feita pelo Serviço. A disponibilidade do WhatsApp é de terceiros e pode variar.",
      "Opcionalmente, você pode conectar sua conta do Google para visualizar os eventos da sua Google Agenda dentro do Serviço e para que os agendamentos que você criar no Serviço sejam espelhados automaticamente na sua Google Agenda. Ao conectar, o Serviço pode criar, atualizar e excluir eventos que ele próprio gera na sua Google Agenda, correspondentes aos seus agendamentos.",
    ],
  },
  {
    heading: "3. Conta e responsabilidades do usuário",
    paragraphs: [
      "Você é responsável por manter a confidencialidade das suas credenciais e por todas as atividades realizadas na sua conta.",
      "Você declara ter autorização para tratar os dados dos pacientes que cadastra, e que obteve deles o consentimento ou possui outra base legal para enviar comunicações por WhatsApp. Você atua como controlador dos dados dos seus pacientes; a Clínica Organizada atua como operadora desses dados, tratando-os conforme suas instruções.",
      "É proibido usar o Serviço para spam, mensagens não solicitadas em massa, conteúdo ilícito, ou de forma que viole os termos do WhatsApp ou a legislação aplicável.",
    ],
  },
  {
    heading: "4. Planos, pagamento e cancelamento",
    paragraphs: [
      "O Serviço oferece um plano gratuito com limites e planos pagos recorrentes. Os preços e limites vigentes são exibidos na página de planos.",
      "As assinaturas pagas são cobradas de forma recorrente pelo provedor de pagamentos. Você pode cancelar a qualquer momento; o acesso ao plano pago permanece até o fim do ciclo já pago, sem reembolso proporcional, salvo disposição legal em contrário.",
    ],
  },
  {
    heading: "5. Disponibilidade e limitação de responsabilidade",
    paragraphs: [
      "O Serviço é fornecido \"como está\". Empregamos esforços razoáveis para mantê-lo disponível, mas não garantimos operação ininterrupta ou livre de erros, nem a entrega de mensagens, que depende de terceiros (WhatsApp).",
      "Na máxima extensão permitida em lei, não nos responsabilizamos por danos indiretos decorrentes do uso ou indisponibilidade do Serviço.",
    ],
  },
  {
    heading: "6. Encerramento da conta",
    paragraphs: [
      "Você pode excluir sua conta a qualquer momento pelas Configurações. A exclusão anonimiza seus dados de identificação e, após período de carência de 30 dias, remove definitivamente os dados de pacientes associados à conta.",
      "Podemos suspender ou encerrar contas que violem estes Termos.",
    ],
  },
  {
    heading: "7. Alterações destes Termos",
    paragraphs: [
      "Podemos atualizar estes Termos periodicamente. Mudanças materiais serão comunicadas e a versão vigente fica sempre disponível nesta página, com a data de última atualização.",
    ],
  },
  {
    heading: "8. Contato",
    paragraphs: [
      "Dúvidas sobre estes Termos podem ser enviadas para " + DPO_EMAIL + ".",
    ],
  },
];

export const PRIVACY_SECTIONS: LegalSection[] = [
  {
    heading: "1. Quem trata seus dados",
    paragraphs: [
      "Esta Política descreve como a Clínica Organizada, operada por " + CONTROLLER_NAME + " (" + CONTROLLER_DOC + "), trata dados pessoais, em conformidade com a LGPD (Lei 13.709/2018).",
      "Encarregado pela proteção de dados (DPO): " + DPO_EMAIL + ".",
    ],
  },
  {
    heading: "2. Dados que coletamos",
    paragraphs: [
      "Do titular da conta (profissional/estabelecimento): nome, e-mail, senha (armazenada com hash), CPF, nome da clínica e dados de uso do Serviço.",
      "Dos pacientes cadastrados pelo usuário: nome, telefone (WhatsApp) e, opcionalmente, CPF — fornecidos e controlados pelo próprio usuário, que é o controlador desses dados.",
      "Dados técnicos: registros de acesso (endereço IP, data/hora), eventos de auditoria e métricas de uso, necessários para segurança e funcionamento.",
    ],
  },
  {
    heading: "3. Para que usamos e bases legais",
    paragraphs: [
      "Para executar o contrato e prestar o Serviço (gerenciar agendamentos, enviar confirmações por WhatsApp): execução de contrato.",
      "Para criar conta, cobrança e comunicações essenciais: execução de contrato e cumprimento de obrigação legal/regulatória (ex.: fiscal).",
      "Para segurança, prevenção a fraude e melhoria do Serviço: legítimo interesse.",
      "Para o aceite destes documentos e comunicações de marketing eventuais: consentimento, quando aplicável.",
    ],
  },
  {
    heading: "4. Compartilhamento com operadores",
    paragraphs: [
      "Compartilhamos dados apenas com prestadores que processam informações em nosso nome, sob contrato e na medida necessária: processador de pagamentos (cobrança recorrente e emissão fiscal), provedor de mensagens WhatsApp, provedor de e-mail transacional, e provedores de hospedagem e banco de dados.",
      "Não vendemos dados pessoais.",
    ],
  },
  {
    heading: "5. Retenção e exclusão",
    paragraphs: [
      "Mantemos os dados enquanto a conta estiver ativa e pelo tempo necessário para cumprir obrigações legais.",
      "Ao excluir a conta, anonimizamos imediatamente os dados de identificação do titular e, após período de carência de 30 dias, removemos definitivamente os dados de pacientes associados. Registros mínimos de auditoria e obrigações legais podem ser mantidos pelo prazo exigido em lei.",
    ],
  },
  {
    heading: "6. Seus direitos (LGPD)",
    paragraphs: [
      "Você pode acessar, corrigir e exportar seus dados, além de solicitar a exclusão da conta. A exportação em formato legível está disponível nas Configurações, e a exclusão pode ser feita pela própria conta.",
      "Para os dados de pacientes, o titular da conta (controlador) é o responsável por atender às solicitações dos pacientes; oferecemos as ferramentas (exportação e exclusão) para viabilizar esse atendimento.",
      "Solicitações e dúvidas: " + DPO_EMAIL + ".",
    ],
  },
  {
    heading: "7. Segurança",
    paragraphs: [
      "Adotamos medidas técnicas e organizacionais razoáveis para proteger os dados, incluindo senhas com hash, dados sensíveis com tratamento próprio (ex.: CPF armazenado de forma protegida) e controle de acesso.",
      "Nenhum método é 100% seguro; em caso de incidente relevante, adotaremos as providências e comunicações exigidas pela LGPD.",
    ],
  },
  {
    heading: "8. Integração com o Google Calendar (Google Agenda)",
    paragraphs: [
      "A conexão com o Google Calendar é opcional e só ocorre após seu consentimento explícito na tela do Google. Ao conectar, o Serviço recebe acesso de leitura e escrita aos eventos da sua Google Agenda (escopo www.googleapis.com/auth/calendar.events).",
      "Uso — leitura: os eventos da sua Google Agenda são exibidos como blocos de contexto, ao lado dos seus agendamentos, para ajudar no planejamento; esses eventos não recebem confirmações automáticas por WhatsApp.",
      "Uso — escrita: os agendamentos que você cria no Serviço são espelhados como eventos na sua agenda principal do Google; editar um agendamento atualiza o evento correspondente e cancelar ou excluir remove esse evento. O Serviço só cria, edita ou exclui eventos que ele próprio gerou; não modifica outros eventos da sua agenda, e não adiciona o paciente como convidado (não enviamos convites em seu nome).",
      "Armazenamento e compartilhamento: as credenciais de acesso (tokens do Google) são armazenadas de forma cifrada; os eventos lidos são consultados em tempo real e não são retidos de forma persistente pelo Serviço. Não usamos os dados da sua Google Agenda para publicidade, não os vendemos e não os compartilhamos com terceiros, exceto os provedores de hospedagem estritamente necessários para operar o recurso.",
      "O uso e a transferência, pelo Serviço, de informações recebidas das APIs do Google obedecem à Política de Dados do Usuário dos Serviços de API do Google (Google API Services User Data Policy), inclusive aos requisitos de Uso Limitado (Limited Use).",
      "Revogação: você pode desconectar a Google Agenda a qualquer momento nas Configurações do Serviço, ou revogar o acesso em myaccount.google.com/permissions. Ao desconectar, revogamos e removemos os tokens armazenados.",
    ],
  },
  {
    heading: "9. Alterações desta Política",
    paragraphs: [
      "Podemos atualizar esta Política. A versão vigente fica sempre disponível nesta página, com a data de última atualização; mudanças materiais serão comunicadas.",
    ],
  },
];

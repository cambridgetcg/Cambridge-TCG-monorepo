/**
 * API Proxy Handler for Widget Localization Files
 * 
 * This endpoint serves translation files for the storefront widget.
 * Requests come through: https://store.myshopify.com/apps/rewardspro/locales/[lang].json
 * And are proxied to: https://app-domain.com/api/proxy/locales/[lang].json
 * 
 * Supported languages: en, es, fr, de, it, ja, pt, zh
 */

import { json, type LoaderFunctionArgs } from "@remix-run/node";

// Default English translations
const translations: Record<string, any> = {
  en: {
    widget: {
      title: "Your Rewards",
      loading: "Loading rewards...",
      error: "Unable to load rewards",
      notLoggedIn: "Please log in to view your rewards",
      notEnrolled: "Join our rewards program!",
      joinBenefits: {
        title: "Member Benefits",
        benefit1: "Earn cashback on every purchase",
        benefit2: "Unlock exclusive member tiers",
        benefit3: "Get personalized rewards"
      },
      balance: {
        title: "Store Credit",
        available: "Available Balance"
      },
      tier: {
        current: "Current Tier",
        cashback: "Cashback Rate",
        next: "Next Tier",
        progress: "Progress",
        remaining: "to reach"
      },
      stats: {
        lifetimeEarned: "Total Earned",
        lifetimeSpent: "Total Spent",
        memberSince: "Member Since",
        availableRewards: "Available Rewards"
      },
      actions: {
        viewDetails: "View Details",
        earnMore: "How to Earn More",
        useCredit: "Use Store Credit",
        close: "Close"
      }
    }
  },
  es: {
    widget: {
      title: "Tus Recompensas",
      loading: "Cargando recompensas...",
      error: "No se pueden cargar las recompensas",
      notLoggedIn: "Por favor inicia sesión para ver tus recompensas",
      notEnrolled: "¡Únete a nuestro programa de recompensas!",
      joinBenefits: {
        title: "Beneficios para Miembros",
        benefit1: "Gana cashback en cada compra",
        benefit2: "Desbloquea niveles exclusivos",
        benefit3: "Obtén recompensas personalizadas"
      },
      balance: {
        title: "Crédito de Tienda",
        available: "Saldo Disponible"
      },
      tier: {
        current: "Nivel Actual",
        cashback: "Tasa de Cashback",
        next: "Siguiente Nivel",
        progress: "Progreso",
        remaining: "para alcanzar"
      },
      stats: {
        lifetimeEarned: "Total Ganado",
        lifetimeSpent: "Total Gastado",
        memberSince: "Miembro Desde",
        availableRewards: "Recompensas Disponibles"
      },
      actions: {
        viewDetails: "Ver Detalles",
        earnMore: "Cómo Ganar Más",
        useCredit: "Usar Crédito de Tienda",
        close: "Cerrar"
      }
    }
  },
  fr: {
    widget: {
      title: "Vos Récompenses",
      loading: "Chargement des récompenses...",
      error: "Impossible de charger les récompenses",
      notLoggedIn: "Veuillez vous connecter pour voir vos récompenses",
      notEnrolled: "Rejoignez notre programme de récompenses!",
      joinBenefits: {
        title: "Avantages Membres",
        benefit1: "Gagnez du cashback sur chaque achat",
        benefit2: "Débloquez des niveaux exclusifs",
        benefit3: "Obtenez des récompenses personnalisées"
      },
      balance: {
        title: "Crédit Boutique",
        available: "Solde Disponible"
      },
      tier: {
        current: "Niveau Actuel",
        cashback: "Taux de Cashback",
        next: "Niveau Suivant",
        progress: "Progression",
        remaining: "pour atteindre"
      },
      stats: {
        lifetimeEarned: "Total Gagné",
        lifetimeSpent: "Total Dépensé",
        memberSince: "Membre Depuis",
        availableRewards: "Récompenses Disponibles"
      },
      actions: {
        viewDetails: "Voir les Détails",
        earnMore: "Comment Gagner Plus",
        useCredit: "Utiliser le Crédit",
        close: "Fermer"
      }
    }
  },
  de: {
    widget: {
      title: "Ihre Prämien",
      loading: "Prämien werden geladen...",
      error: "Prämien können nicht geladen werden",
      notLoggedIn: "Bitte melden Sie sich an, um Ihre Prämien zu sehen",
      notEnrolled: "Treten Sie unserem Prämienprogramm bei!",
      joinBenefits: {
        title: "Mitgliedervorteile",
        benefit1: "Verdienen Sie Cashback bei jedem Einkauf",
        benefit2: "Exklusive Stufen freischalten",
        benefit3: "Personalisierte Prämien erhalten"
      },
      balance: {
        title: "Shop-Guthaben",
        available: "Verfügbares Guthaben"
      },
      tier: {
        current: "Aktuelle Stufe",
        cashback: "Cashback-Rate",
        next: "Nächste Stufe",
        progress: "Fortschritt",
        remaining: "bis zum Erreichen"
      },
      stats: {
        lifetimeEarned: "Gesamt Verdient",
        lifetimeSpent: "Gesamt Ausgegeben",
        memberSince: "Mitglied Seit",
        availableRewards: "Verfügbare Prämien"
      },
      actions: {
        viewDetails: "Details Anzeigen",
        earnMore: "Mehr Verdienen",
        useCredit: "Guthaben Verwenden",
        close: "Schließen"
      }
    }
  },
  it: {
    widget: {
      title: "I Tuoi Premi",
      loading: "Caricamento premi...",
      error: "Impossibile caricare i premi",
      notLoggedIn: "Accedi per vedere i tuoi premi",
      notEnrolled: "Unisciti al nostro programma premi!",
      joinBenefits: {
        title: "Vantaggi per i Membri",
        benefit1: "Guadagna cashback su ogni acquisto",
        benefit2: "Sblocca livelli esclusivi",
        benefit3: "Ottieni premi personalizzati"
      },
      balance: {
        title: "Credito Negozio",
        available: "Saldo Disponibile"
      },
      tier: {
        current: "Livello Attuale",
        cashback: "Tasso di Cashback",
        next: "Prossimo Livello",
        progress: "Progresso",
        remaining: "per raggiungere"
      },
      stats: {
        lifetimeEarned: "Totale Guadagnato",
        lifetimeSpent: "Totale Speso",
        memberSince: "Membro Dal",
        availableRewards: "Premi Disponibili"
      },
      actions: {
        viewDetails: "Vedi Dettagli",
        earnMore: "Come Guadagnare di Più",
        useCredit: "Usa il Credito",
        close: "Chiudi"
      }
    }
  },
  ja: {
    widget: {
      title: "あなたのリワード",
      loading: "リワードを読み込み中...",
      error: "リワードを読み込めません",
      notLoggedIn: "リワードを見るにはログインしてください",
      notEnrolled: "リワードプログラムに参加しましょう！",
      joinBenefits: {
        title: "メンバー特典",
        benefit1: "すべての購入でキャッシュバック",
        benefit2: "限定ティアのロック解除",
        benefit3: "パーソナライズされたリワード"
      },
      balance: {
        title: "ストアクレジット",
        available: "利用可能残高"
      },
      tier: {
        current: "現在のティア",
        cashback: "キャッシュバック率",
        next: "次のティア",
        progress: "進捗",
        remaining: "達成まで"
      },
      stats: {
        lifetimeEarned: "総獲得額",
        lifetimeSpent: "総支出額",
        memberSince: "メンバー開始日",
        availableRewards: "利用可能なリワード"
      },
      actions: {
        viewDetails: "詳細を見る",
        earnMore: "もっと獲得する方法",
        useCredit: "クレジットを使う",
        close: "閉じる"
      }
    }
  },
  pt: {
    widget: {
      title: "Suas Recompensas",
      loading: "Carregando recompensas...",
      error: "Não foi possível carregar as recompensas",
      notLoggedIn: "Faça login para ver suas recompensas",
      notEnrolled: "Junte-se ao nosso programa de recompensas!",
      joinBenefits: {
        title: "Benefícios para Membros",
        benefit1: "Ganhe cashback em cada compra",
        benefit2: "Desbloqueie níveis exclusivos",
        benefit3: "Obtenha recompensas personalizadas"
      },
      balance: {
        title: "Crédito da Loja",
        available: "Saldo Disponível"
      },
      tier: {
        current: "Nível Atual",
        cashback: "Taxa de Cashback",
        next: "Próximo Nível",
        progress: "Progresso",
        remaining: "para alcançar"
      },
      stats: {
        lifetimeEarned: "Total Ganho",
        lifetimeSpent: "Total Gasto",
        memberSince: "Membro Desde",
        availableRewards: "Recompensas Disponíveis"
      },
      actions: {
        viewDetails: "Ver Detalhes",
        earnMore: "Como Ganhar Mais",
        useCredit: "Usar Crédito",
        close: "Fechar"
      }
    }
  },
  zh: {
    widget: {
      title: "您的奖励",
      loading: "加载奖励中...",
      error: "无法加载奖励",
      notLoggedIn: "请登录查看您的奖励",
      notEnrolled: "加入我们的奖励计划！",
      joinBenefits: {
        title: "会员福利",
        benefit1: "每次购买都能获得返现",
        benefit2: "解锁专属会员等级",
        benefit3: "获得个性化奖励"
      },
      balance: {
        title: "商店积分",
        available: "可用余额"
      },
      tier: {
        current: "当前等级",
        cashback: "返现率",
        next: "下一等级",
        progress: "进度",
        remaining: "距离达成"
      },
      stats: {
        lifetimeEarned: "总计获得",
        lifetimeSpent: "总计消费",
        memberSince: "成为会员时间",
        availableRewards: "可用奖励"
      },
      actions: {
        viewDetails: "查看详情",
        earnMore: "如何赚取更多",
        useCredit: "使用积分",
        close: "关闭"
      }
    }
  }
};

export async function loader({ params }: LoaderFunctionArgs) {
  // Extract language code from the dynamic route parameter
  const langFile = params["*"] || "en.json";
  const lang = langFile.replace(".json", "");
  
  // Get translations for the requested language, fallback to English
  const langTranslations = translations[lang] || translations.en;
  
  // Return JSON response with appropriate headers
  return json(langTranslations, {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=3600", // Cache for 1 hour
      "Access-Control-Allow-Origin": "*", // Allow cross-origin access for widget
    }
  });
}
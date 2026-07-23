import type { LoaderFunctionArgs, MetaFunction } from "@remix-run/node";
import { redirect } from "@remix-run/node";
import { Form, useLoaderData } from "@remix-run/react";
import { useState } from "react";
import { login } from "../../shopify.server";

export const meta: MetaFunction = () => {
  return [
    { title: "RewardsPro - Customer Loyalty & Rewards for Shopify" },
    { 
      name: "description", 
      content: "Transform your customers into loyal fans with automated cashback tiers. Boost repeat purchases and increase customer lifetime value." 
    },
  ];
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);

  if (url.searchParams.get("shop")) {
    throw redirect(`/app?${url.searchParams.toString()}`);
  }

  return { showForm: Boolean(login) };
};

// FAQ data
const faqs = [
  {
    question: "How does the loyalty program work?",
    answer: "RewardsPro automatically tracks customer purchases and awards store credit based on your configured tiers. Customers earn cashback percentages that increase as they spend more, encouraging repeat purchases."
  },
  {
    question: "Can I customize the reward tiers?",
    answer: "Yes! You have full control over tier names, spending thresholds, and cashback percentages. Set up as many tiers as you want to match your business strategy."
  },
  {
    question: "How do customers redeem their rewards?",
    answer: "Store credit is automatically applied at checkout. Customers can see their balance and apply it to any purchase with a single click."
  },
  {
    question: "Does it work with my Shopify theme?",
    answer: "RewardsPro works seamlessly with any Shopify theme. Our app integrates directly with Shopify's native store credit system."
  },
  {
    question: "What happens with refunds?",
    answer: "Refunds are handled automatically. If an order is refunded, the associated cashback is reversed, maintaining accurate balances."
  },
  {
    question: "Is there a free plan?",
    answer: "Yes! Our free plan includes up to 200 orders per month, perfect for small stores just starting with loyalty programs."
  }
];

// Pricing plans data
const pricingPlans = [
  {
    name: "Free",
    price: "$0",
    period: "month",
    ordersIncluded: "200 orders/month",
    features: [
      "Basic loyalty tiers",
      "Store credit tracking",
      "Customer dashboard",
      "Email support"
    ],
    cta: "Start Free",
    highlighted: false
  },
  {
    name: "Starter",
    price: "$49",
    period: "month",
    ordersIncluded: "500 orders/month",
    features: [
      "Everything in Free",
      "Unlimited tiers",
      "Custom emails",
      "Priority support",
      "Basic analytics"
    ],
    cta: "Start Trial",
    highlighted: true
  },
  {
    name: "Growth",
    price: "$199",
    period: "month",
    ordersIncluded: "2,500 orders/month",
    overageRate: "$20 per 100 additional",
    features: [
      "Everything in Starter",
      "Advanced analytics",
      "API webhooks",
      "VIP tier features",
      "Phone support"
    ],
    cta: "Start Trial",
    highlighted: false
  },
  {
    name: "Plus",
    price: "$999",
    period: "month",
    ordersIncluded: "7,500 orders/month",
    overageRate: "$5 per 100 additional",
    features: [
      "Everything in Growth",
      "Custom reporting",
      "Dedicated manager",
      "White-glove setup",
      "SLA guarantee"
    ],
    cta: "Contact Sales",
    highlighted: false
  }
];

export default function LandingPage() {
  const { showForm } = useLoaderData<typeof loader>();
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [shopDomain, setShopDomain] = useState("");

  return (
    <div className="min-h-screen bg-white">
      {/* Navigation */}
      <nav className="fixed top-0 w-full bg-white/95 backdrop-blur-sm z-50 border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center">
              <span className="text-2xl font-bold text-purple-600">RewardsPro</span>
            </div>
            <div className="hidden md:flex items-center space-x-8">
              <a href="#features" className="text-gray-600 hover:text-purple-600 transition-colors">Features</a>
              <a href="#how-it-works" className="text-gray-600 hover:text-purple-600 transition-colors">How it Works</a>
              <a href="#pricing" className="text-gray-600 hover:text-purple-600 transition-colors">Pricing</a>
              <a href="#faq" className="text-gray-600 hover:text-purple-600 transition-colors">FAQ</a>
              <button
                onClick={() => document.getElementById('get-started')?.scrollIntoView({ behavior: 'smooth' })}
                className="bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 transition-colors"
              >
                Get Started
              </button>
            </div>
          </div>
        </div>
      </nav>

      <main id="main-content">
      {/* Hero Section */}
      <section className="pt-32 pb-20 px-4 bg-gradient-to-br from-purple-50 to-white">
        <div className="max-w-7xl mx-auto text-center">
          <h1 className="text-5xl md:text-6xl font-bold text-gray-900 mb-6">
            Transform Your Customers into
            <span className="text-purple-600"> Loyal Fans</span>
          </h1>
          <p className="text-xl text-gray-600 mb-8 max-w-3xl mx-auto">
            Reward repeat purchases with automated cashback tiers that keep customers coming back. 
            Boost retention, increase order values, and grow your Shopify store.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <button
              onClick={() => document.getElementById('get-started')?.scrollIntoView({ behavior: 'smooth' })}
              className="bg-purple-600 text-white px-8 py-4 rounded-lg text-lg font-semibold hover:bg-purple-700 transition-all transform hover:scale-105"
            >
              Start Free Trial
            </button>
            <a
              href="#how-it-works"
              className="bg-white text-purple-600 px-8 py-4 rounded-lg text-lg font-semibold border-2 border-purple-600 hover:bg-purple-50 transition-all"
            >
              See How It Works
            </a>
          </div>
          <p className="mt-4 text-gray-500">No credit card required • Setup in 5 minutes</p>
        </div>
      </section>

      {/* Value Proposition */}
      <section className="py-20 px-4 bg-white">
        <div className="max-w-7xl mx-auto">
          <h2 className="text-4xl font-bold text-center mb-4">Why RewardsPro?</h2>
          <p className="text-xl text-gray-600 text-center mb-12 max-w-3xl mx-auto">
            Join thousands of Shopify stores using rewards to drive growth
          </p>
          <div className="grid md:grid-cols-3 gap-8">
            <div className="text-center p-6">
              <div className="text-4xl mb-4">📈</div>
              <h3 className="text-2xl font-semibold mb-3">Increase Repeat Purchases</h3>
              <p className="text-gray-600">Customers with rewards are 1.5x more likely to make another purchase</p>
            </div>
            <div className="text-center p-6">
              <div className="text-4xl mb-4">💰</div>
              <h3 className="text-2xl font-semibold mb-3">Boost Order Values</h3>
              <p className="text-gray-600">Loyalty members spend 3x more on average than regular customers</p>
            </div>
            <div className="text-center p-6">
              <div className="text-4xl mb-4">🔄</div>
              <h3 className="text-2xl font-semibold mb-3">Automate Everything</h3>
              <p className="text-gray-600">Set it and forget it - rewards calculate and apply automatically</p>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works Timeline */}
      <section id="how-it-works" className="py-20 px-4 bg-gray-50">
        <div className="max-w-7xl mx-auto">
          <h2 className="text-4xl font-bold text-center mb-4">Your Loyalty Program Journey</h2>
          <p className="text-xl text-gray-600 text-center mb-12">
            See how RewardsPro creates repeat purchases
          </p>
          
          <div className="relative">
            {/* Timeline line */}
            <div className="hidden md:block absolute top-1/2 left-0 right-0 h-1 bg-purple-200 -translate-y-1/2"></div>
            
            <div className="grid md:grid-cols-3 gap-8 relative">
              {/* Step 1 */}
              <div className="bg-white p-6 rounded-xl shadow-lg relative">
                <div className="absolute -top-4 left-6 bg-purple-100 text-purple-600 rounded-full w-12 h-12 flex items-center justify-center font-bold">
                  1
                </div>
                <div className="mt-6">
                  <div className="text-3xl mb-3">👤</div>
                  <p className="text-sm text-gray-500 uppercase tracking-wide mb-2">IN A FEW DAYS</p>
                  <h3 className="text-xl font-bold mb-2">First customer earns</h3>
                  <p className="text-gray-600">
                    Customers that earn points are 1.5x more likely to make a repeat purchase!
                  </p>
                </div>
              </div>

              {/* Step 2 */}
              <div className="bg-white p-6 rounded-xl shadow-lg relative">
                <div className="absolute -top-4 left-6 bg-purple-100 text-purple-600 rounded-full w-12 h-12 flex items-center justify-center font-bold">
                  2
                </div>
                <div className="mt-6">
                  <div className="text-3xl mb-3">🎁</div>
                  <p className="text-sm text-gray-500 uppercase tracking-wide mb-2">WITHIN 90 DAYS</p>
                  <h3 className="text-xl font-bold mb-2">First customer redeems</h3>
                  <p className="text-gray-600">
                    Customers that redeem points spend 3x more on average than other customers!
                  </p>
                </div>
              </div>

              {/* Step 3 */}
              <div className="bg-white p-6 rounded-xl shadow-lg relative">
                <div className="absolute -top-4 left-6 bg-purple-100 text-purple-600 rounded-full w-12 h-12 flex items-center justify-center font-bold">
                  3
                </div>
                <div className="mt-6">
                  <div className="text-3xl mb-3">🛒</div>
                  <p className="text-sm text-gray-500 uppercase tracking-wide mb-2">AFTER CUSTOMER REDEEMS</p>
                  <h3 className="text-xl font-bold mb-2">Repeat order placed</h3>
                  <p className="text-gray-600">
                    Customers are more likely to place this order because of their points discount.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section id="features" className="py-20 px-4 bg-white">
        <div className="max-w-7xl mx-auto">
          <h2 className="text-4xl font-bold text-center mb-4">Everything You Need for Customer Loyalty</h2>
          <p className="text-xl text-gray-600 text-center mb-12">
            Powerful features that work seamlessly with your Shopify store
          </p>
          
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            <div className="p-6 border border-gray-200 rounded-xl hover:shadow-lg transition-shadow">
              <div className="text-purple-600 mb-4">
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
              </div>
              <h3 className="text-xl font-semibold mb-2">Tiered Rewards</h3>
              <p className="text-gray-600">Create unlimited tiers with progressive cashback rates to incentivize higher spending</p>
            </div>

            <div className="p-6 border border-gray-200 rounded-xl hover:shadow-lg transition-shadow">
              <div className="text-purple-600 mb-4">
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h3 className="text-xl font-semibold mb-2">Store Credit</h3>
              <p className="text-gray-600">Automatic balance tracking with Shopify's native store credit system</p>
            </div>

            <div className="p-6 border border-gray-200 rounded-xl hover:shadow-lg transition-shadow">
              <div className="text-purple-600 mb-4">
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              </div>
              <h3 className="text-xl font-semibold mb-2">Customer Portal</h3>
              <p className="text-gray-600">Self-service dashboard where customers can track rewards and tier status</p>
            </div>

            <div className="p-6 border border-gray-200 rounded-xl hover:shadow-lg transition-shadow">
              <div className="text-purple-600 mb-4">
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <h3 className="text-xl font-semibold mb-2">Order Sync</h3>
              <p className="text-gray-600">Seamless integration with Shopify orders - automatic cashback calculation</p>
            </div>

            <div className="p-6 border border-gray-200 rounded-xl hover:shadow-lg transition-shadow">
              <div className="text-purple-600 mb-4">
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              </div>
              <h3 className="text-xl font-semibold mb-2">Analytics</h3>
              <p className="text-gray-600">Track program performance, customer engagement, and ROI metrics</p>
            </div>

            <div className="p-6 border border-gray-200 rounded-xl hover:shadow-lg transition-shadow">
              <div className="text-purple-600 mb-4">
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </div>
              <h3 className="text-xl font-semibold mb-2">Email Updates</h3>
              <p className="text-gray-600">Automated notifications for tier changes, rewards earned, and more</p>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="py-20 px-4 bg-gray-50">
        <div className="max-w-7xl mx-auto">
          <h2 className="text-4xl font-bold text-center mb-4">Choose Your Plan</h2>
          <p className="text-xl text-gray-600 text-center mb-12">
            Start free and scale as you grow
          </p>
          
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {pricingPlans.map((plan) => (
              <div
                key={plan.name}
                className={`bg-white rounded-xl p-6 ${
                  plan.highlighted 
                    ? 'ring-2 ring-purple-600 shadow-xl scale-105' 
                    : 'border border-gray-200'
                }`}
              >
                {plan.highlighted && (
                  <div className="bg-purple-600 text-white text-sm font-semibold py-1 px-3 rounded-full inline-block mb-4">
                    MOST POPULAR
                  </div>
                )}
                <h3 className="text-2xl font-bold mb-2">{plan.name}</h3>
                <div className="mb-4">
                  <span className="text-4xl font-bold">{plan.price}</span>
                  <span className="text-gray-600">/{plan.period}</span>
                </div>
                <p className="text-gray-600 mb-2">{plan.ordersIncluded}</p>
                {plan.overageRate && (
                  <p className="text-sm text-gray-500 mb-4">{plan.overageRate}</p>
                )}
                <ul className="space-y-3 mb-6">
                  {plan.features.map((feature, idx) => (
                    <li key={idx} className="flex items-start">
                      <svg className="w-5 h-5 text-green-500 mr-2 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                      <span className="text-gray-600 text-sm">{feature}</span>
                    </li>
                  ))}
                </ul>
                <button
                  onClick={() => document.getElementById('get-started')?.scrollIntoView({ behavior: 'smooth' })}
                  className={`w-full py-3 px-4 rounded-lg font-semibold transition-all ${
                    plan.highlighted
                      ? 'bg-purple-600 text-white hover:bg-purple-700'
                      : 'bg-gray-100 text-gray-900 hover:bg-gray-200'
                  }`}
                >
                  {plan.cta}
                </button>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Social Proof */}
      <section className="py-20 px-4 bg-white">
        <div className="max-w-7xl mx-auto text-center">
          <h2 className="text-4xl font-bold mb-12">Trusted by Thousands of Shopify Stores</h2>
          <div className="grid md:grid-cols-3 gap-8">
            <div>
              <div className="text-5xl font-bold text-purple-600 mb-2">10,000+</div>
              <p className="text-gray-600">Active Stores</p>
            </div>
            <div>
              <div className="text-5xl font-bold text-purple-600 mb-2">$5M+</div>
              <p className="text-gray-600">Rewards Distributed</p>
            </div>
            <div>
              <div className="text-5xl font-bold text-purple-600 mb-2">98%</div>
              <p className="text-gray-600">Customer Satisfaction</p>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section id="faq" className="py-20 px-4 bg-gray-50">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-4xl font-bold text-center mb-12">Frequently Asked Questions</h2>
          <div className="space-y-4">
            {faqs.map((faq, index) => (
              <div key={index} className="bg-white rounded-lg shadow-sm">
                <button
                  className="w-full px-6 py-4 text-left flex justify-between items-center hover:bg-gray-50 transition-colors"
                  onClick={() => setOpenFaq(openFaq === index ? null : index)}
                >
                  <span className="font-semibold text-gray-900">{faq.question}</span>
                  <svg
                    className={`w-5 h-5 text-gray-500 transform transition-transform ${
                      openFaq === index ? 'rotate-180' : ''
                    }`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {openFaq === index && (
                  <div className="px-6 pb-4">
                    <p className="text-gray-600">{faq.answer}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Get Started Form */}
      <section id="get-started" className="py-20 px-4 bg-gradient-to-br from-purple-600 to-purple-800">
        <div className="max-w-xl mx-auto text-center">
          <h2 className="text-4xl font-bold text-white mb-4">
            Ready to Boost Customer Loyalty?
          </h2>
          <p className="text-xl text-purple-100 mb-8">
            Join thousands of stores using RewardsPro to increase retention
          </p>
          
          {showForm && (
            <Form method="post" action="/auth/login" className="space-y-4">
              <div>
                <input
                  type="text"
                  name="shop"
                  value={shopDomain}
                  onChange={(e) => setShopDomain(e.target.value)}
                  placeholder="your-store.myshopify.com"
                  className="w-full px-4 py-3 rounded-lg text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-300"
                  required
                />
              </div>
              <button
                type="submit"
                className="w-full bg-white text-purple-600 px-8 py-4 rounded-lg text-lg font-semibold hover:bg-gray-100 transition-all transform hover:scale-105"
              >
                Start Your Free Trial
              </button>
            </Form>
          )}
          
          <p className="mt-4 text-purple-200">No credit card required • Setup in 5 minutes</p>
        </div>
      </section>

      {/* Help Section */}
      <section className="py-20 px-4 bg-white border-t border-gray-100">
        <div className="max-w-4xl mx-auto">
          <div className="bg-gray-50 rounded-2xl p-8 text-center">
            <div className="inline-block mb-6">
              <img 
                src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120' viewBox='0 0 120 120'%3E%3Ccircle cx='60' cy='40' r='25' fill='%23E9D5FF'/%3E%3Cpath d='M35 70 Q60 85 85 70' fill='%23E9D5FF'/%3E%3Crect x='50' y='65' width='20' height='30' rx='5' fill='%23E9D5FF'/%3E%3Cpath d='M45 85 L40 105 L80 105 L75 85' fill='%23E9D5FF'/%3E%3C/svg%3E" 
                alt="Support illustration" 
                className="w-32 h-32"
              />
            </div>
            <h3 className="text-2xl font-bold mb-4">Have a question? Check out our Help Center!</h3>
            <p className="text-gray-600 mb-6">
              Our help center has everything you need to get the most out of your rewards program.
            </p>
            <a
              href="/help"
              className="inline-flex items-center bg-white border border-gray-300 px-6 py-3 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
              Visit the Help Center
            </a>
          </div>
        </div>
      </section>
      </main>

      {/* Footer */}
      <footer className="bg-gray-900 text-white py-12 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="grid md:grid-cols-4 gap-8 mb-8">
            <div>
              <h3 className="text-2xl font-bold mb-4 text-purple-400">RewardsPro</h3>
              <p className="text-gray-400">
                The easiest way to build customer loyalty on Shopify.
              </p>
            </div>
            
            <div>
              <h4 className="font-semibold mb-4">Product</h4>
              <ul className="space-y-2 text-gray-400">
                <li><a href="#features" className="hover:text-white transition-colors">Features</a></li>
                <li><a href="#pricing" className="hover:text-white transition-colors">Pricing</a></li>
                <li><a href="#how-it-works" className="hover:text-white transition-colors">How it Works</a></li>
                <li><a href="/docs" className="hover:text-white transition-colors">API Docs</a></li>
              </ul>
            </div>
            
            <div>
              <h4 className="font-semibold mb-4">Resources</h4>
              <ul className="space-y-2 text-gray-400">
                <li><a href="/help" className="hover:text-white transition-colors">Help Center</a></li>
                <li><a href="/blog" className="hover:text-white transition-colors">Blog</a></li>
                <li><a href="/guides" className="hover:text-white transition-colors">Guides</a></li>
                <li><a href="#faq" className="hover:text-white transition-colors">FAQ</a></li>
              </ul>
            </div>
            
            <div>
              <h4 className="font-semibold mb-4">Company</h4>
              <ul className="space-y-2 text-gray-400">
                <li><a href="/about" className="hover:text-white transition-colors">About</a></li>
                <li><a href="/contact" className="hover:text-white transition-colors">Contact</a></li>
                <li><a href="/privacy" className="hover:text-white transition-colors">Privacy Policy</a></li>
                <li><a href="/terms" className="hover:text-white transition-colors">Terms of Service</a></li>
              </ul>
            </div>
          </div>
          
          <div className="border-t border-gray-800 pt-8 flex flex-col md:flex-row justify-between items-center">
            <p className="text-gray-400">© 2025 RewardsPro. All rights reserved.</p>
            <div className="flex space-x-6 mt-4 md:mt-0">
              <span className="text-gray-400">
                <span className="sr-only">Twitter</span>
                <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8.29 20.251c7.547 0 11.675-6.253 11.675-11.675 0-.178 0-.355-.012-.53A8.348 8.348 0 0022 5.92a8.19 8.19 0 01-2.357.646 4.118 4.118 0 001.804-2.27 8.224 8.224 0 01-2.605.996 4.107 4.107 0 00-6.993 3.743 11.65 11.65 0 01-8.457-4.287 4.106 4.106 0 001.27 5.477A4.072 4.072 0 012.8 9.713v.052a4.105 4.105 0 003.292 4.022 4.095 4.095 0 01-1.853.07 4.108 4.108 0 003.834 2.85A8.233 8.233 0 012 18.407a11.616 11.616 0 006.29 1.84" />
                </svg>
              </span>
              <span className="text-gray-400">
                <span className="sr-only">LinkedIn</span>
                <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z"/>
                </svg>
              </span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

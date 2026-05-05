export interface EmailLayoutProps {
  content: string;
  preheader?: string;
  siteUrl?: string;
}

export function getEmailLayout({ content, preheader, siteUrl }: EmailLayoutProps): string {
  const baseUrl = siteUrl || process.env.NEXT_PUBLIC_SITE_URL || 'https://primundus.de';
  return `
<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  ${preheader ? `<meta name="description" content="${preheader}">` : ''}
  <title>Primundus 24h-Pflege</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      line-height: 1.6;
      color: #333333;
      background-color: #f4f4f4;
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
    }

    .email-wrapper {
      width: 100%;
      background-color: #f4f4f4;
      padding: 20px 0;
    }

    .email-container {
      max-width: 600px;
      margin: 0 auto;
      background-color: #ffffff;
      border-radius: 8px;
      overflow: hidden;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    }

    .email-header {
      background: #ffffff;
      padding: 24px 40px 20px 40px;
      border-bottom: 1px solid #f0ebe4;
    }

    .email-header img {
      max-width: 160px;
      height: auto;
      display: block;
    }

    .email-header h1 {
      color: #3D2B1F;
      font-size: 24px;
      font-weight: 700;
      margin: 0;
    }

    .email-content {
      padding: 40px 40px 32px;
      text-align: left;
    }

    .email-content p {
      margin: 0 0 16px 0;
      font-size: 16px;
      line-height: 1.6;
      color: #333333;
      text-align: left;
    }

    .email-content ul, .email-content ol {
      margin: 0 0 16px 20px;
      padding: 0;
    }

    .email-content li {
      margin-bottom: 8px;
      font-size: 16px;
      line-height: 1.6;
    }

    .email-content h2 {
      color: #5C4A32;
      font-size: 20px;
      font-weight: 600;
      margin: 24px 0 16px 0;
    }

    .email-content h3 {
      color: #5C4A32;
      font-size: 18px;
      font-weight: 600;
      margin: 20px 0 12px 0;
    }

    .price-highlight {
      background: linear-gradient(135deg, #FFF8E7 0%, #FFF0CC 100%);
      border-left: 4px solid #5C4A32;
      padding: 20px;
      margin: 24px 0;
      border-radius: 4px;
    }

    .price-highlight .label {
      font-size: 14px;
      color: #666666;
      margin-bottom: 8px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      font-weight: 600;
    }

    .price-highlight .price {
      font-size: 36px;
      font-weight: 700;
      color: #5C4A32;
      line-height: 1.2;
    }

    .price-highlight .subtitle {
      font-size: 14px;
      color: #666666;
      margin-top: 4px;
    }

    .info-box {
      background-color: #f8f9fa;
      border-left: 4px solid #0066CC;
      padding: 16px;
      margin: 20px 0;
      border-radius: 4px;
    }

    .success-box {
      background-color: #E8F5E9;
      border-left: 4px solid #4CAF50;
      padding: 16px;
      margin: 20px 0;
      border-radius: 4px;
    }

    .cta-button {
      display: inline-block;
      background: linear-gradient(135deg, #B5A184 0%, #9A8A73 100%);
      color: #ffffff !important;
      text-decoration: none;
      padding: 16px 32px;
      border-radius: 6px;
      font-weight: 600;
      font-size: 16px;
      text-align: center;
      margin: 10px 0;
      box-shadow: 0 2px 4px rgba(181, 161, 132, 0.35);
      transition: all 0.3s ease;
    }

    .cta-button:hover {
      box-shadow: 0 4px 8px rgba(181, 161, 132, 0.45);
      transform: translateY(-1px);
    }

    .cta-center {
      text-align: center;
      margin: 30px 0;
    }

    .divider {
      border: 0;
      border-top: 1px solid #e0e0e0;
      margin: 30px 0;
    }

    .email-footer {
      background-color: #f8f9fa;
      padding: 30px;
      text-align: center;
      border-top: 1px solid #e0e0e0;
    }

    .email-footer .company-info {
      margin-bottom: 16px;
    }

    .email-footer .company-name {
      font-weight: 600;
      font-size: 16px;
      color: #3D2B1F;
      margin-bottom: 8px;
    }

    .email-footer .contact-info {
      font-size: 14px;
      color: #666666;
      line-height: 1.6;
    }

    .email-footer .contact-info a {
      color: #0066CC;
      text-decoration: none;
    }

    .email-footer .social-links {
      margin: 20px 0;
    }

    .email-footer .social-links a {
      display: inline-block;
      margin: 0 8px;
      color: #666666;
      text-decoration: none;
      font-size: 14px;
    }

    .email-footer .legal {
      font-size: 12px;
      color: #999999;
      margin-top: 20px;
      line-height: 1.5;
    }

    @media only screen and (max-width: 600px) {
      .email-container {
        border-radius: 0;
      }

      .email-content {
        padding: 30px 20px;
      }

      .price-highlight .price {
        font-size: 28px;
      }

      .cta-button {
        display: block;
        width: 100%;
        padding: 14px 20px;
      }
    }
  </style>
</head>
<body>
  <div class="email-wrapper">
    ${preheader ? `
    <div style="display: none; max-height: 0; overflow: hidden; font-size: 1px; line-height: 1px; color: transparent;">
      ${preheader}
    </div>
    ` : ''}
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
      <tr>
        <td align="center">
          <div class="email-container">
            <div class="email-header">
              <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
                <tr>
                  <td style="vertical-align: middle;">
                    <img src="${baseUrl}/images/Primundus-Logo_V6.png" alt="Primundus Logo" style="max-width: 160px; height: auto; display: block;" />
                  </td>
                  <td style="vertical-align: middle; text-align: right;">
                    <table cellpadding="0" cellspacing="0" role="presentation" style="margin-left: auto;">
                      <tr>
                        <td style="text-align: center; vertical-align: middle; padding-right: 8px; border-right: 1px solid #f0ebe4;">
                          <img src="${baseUrl}/images/primundus_testsieger-2021.webp" alt="Testsieger DIE WELT" width="36" style="display: block; width: 36px; height: auto;" />
                        </td>
                        <td style="text-align: left; padding-left: 8px;">
                          <p style="margin: 0 0 1px 0; font-size: 10px; font-weight: 700; color: #3D2B1F; white-space: nowrap;">Testsieger</p>
                          <p style="margin: 0 0 1px 0; font-size: 10px; color: #B5A184; white-space: nowrap; font-weight: 600;">DIE WELT</p>
                          <p style="margin: 0; font-size: 9px; color: #aaa; white-space: nowrap;">Preis &amp; Qualität</p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </div>
            <div class="email-content" style="text-align:left;">
              ${content}
            </div>
            <div class="email-footer">
              <div class="company-info">
                <div class="company-name">Primundus Deutschland</div>
                <div class="contact-info">
                  24h-Pflege und Betreuung zu Hause<br>
                  <a href="tel:+4989200000830">+49 89 200 000 830</a> |
                  <a href="mailto:info@primundus.de">info@primundus.de</a><br>
                  <a href="https://primundus.de" style="color: #0066CC;">www.primundus.de</a>
                </div>
              </div>
              <div class="legal">
                Diese E-Mail wurde versendet an: {{EMAIL}}<br>
                Primundus Deutschland | Vitanas Group<br>
                <br>
                Sie erhalten diese E-Mail, weil Sie eine Kalkulation auf primundus.de angefordert haben.
              </div>
            </div>
          </div>
        </td>
      </tr>
    </table>
  </div>
</body>
</html>
  `.trim();
}

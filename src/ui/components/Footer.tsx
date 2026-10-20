export function Footer({ onHowTo }: { onHowTo?: () => void }) {
  return (
    <footer className="footer">
      <nav className="footer-links" aria-label="Rodapé">
        {onHowTo && (
          <button type="button" className="link" onClick={onHowTo}>
            Como jogar
          </button>
        )}
        <a href="#creditos">Créditos de dados</a>
        <a href="#aviso">Aviso de fã</a>
      </nav>
      <p className="footer-credits" id="creditos">
        Dados:{' '}
        <a href="https://www.vlr.gg" target="_blank" rel="noopener noreferrer">
          VLR.gg
        </a>{' '}
        (stats por evento) e{' '}
        <a href="https://liquipedia.net/valorant/" target="_blank" rel="noopener noreferrer">
          Liquipedia
        </a>{' '}
        (elencos, técnicos e IGLs,{' '}
        <a href="https://creativecommons.org/licenses/by-sa/3.0/" target="_blank" rel="noopener noreferrer">
          CC-BY-SA 3.0
        </a>
        ). OVR e atributos são calculados a partir desses números.
      </p>
      <p className="footer-credits">
        Logos e fotos:{' '}
        <a href="https://www.vlr.gg" target="_blank" rel="noopener noreferrer">
          VLR.gg
        </a>{' '}
        /{' '}
        <a href="https://liquipedia.net/valorant/" target="_blank" rel="noopener noreferrer">
          Liquipedia
        </a>{' '}
        — retiramos qualquer imagem a pedido do titular. Imagens de mapas e agentes são da Riot Games.
      </p>
      <p className="footer-credits">
        Dados do jogo (agentes, habilidades, mapas, callouts e armas) e imagens de habilidades, armas e minimapas:{' '}
        <a href="https://valorant-api.com" target="_blank" rel="noopener noreferrer">
          valorant-api.com
        </a>{' '}
        (API comunitária, não oficial), conteúdo da Riot Games. Imagens dos lugares dos mapas:{' '}
        <a href="https://wiki.playvalorant.com" target="_blank" rel="noopener noreferrer">
          VALORANT Wiki
        </a>{' '}
        (Riot Games).
      </p>
      <p id="aviso">
        Road to Champions é um projeto de fã, não oficial, e não é endossado pela Riot Games. Não reflete as opiniões
        de ninguém oficialmente envolvido na produção ou gestão de propriedades da Riot Games. Riot Games e todas as
        propriedades associadas são marcas registradas da Riot Games, Inc.
      </p>
    </footer>
  );
}

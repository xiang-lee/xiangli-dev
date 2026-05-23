import sys

with open("projects.html", "r") as f:
    content = f.read()

jobshift_card = """
            <article class="card project-card reveal">
              <div class="project-media">
                <div style="width: 100%; height: 100%; background: linear-gradient(135deg, #10b981, #3b82f6); display: flex; align-items: center; justify-content: center; color: white; font-family: 'Geist', sans-serif; font-size: 1.8rem; font-weight: 600;">JobShift</div>
              </div>
              <div class="project-body">
                <div class="project-head">
                  <span class="tag">Live App</span>
                  <h3>JobShift</h3>
                </div>
                <p>
                  AI-driven resume tailoring and cover letter generation. Land your dream job by matching your skills directly to the job description.
                </p>
                <div class="stack project-tags">
                  <span class="tag">AI</span>
                  <span class="tag">Career</span>
                  <span class="tag">Vue</span>
                </div>
                <div class="project-actions">
                  <a
                    class="btn"
                    href="https://jobshift.xiangli.dev/"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Open JobShift
                  </a>
                </div>
              </div>
            </article>"""

if "JobShift" not in content:
    # Insert right after the opening of the project-grid
    content = content.replace('<div class="grid two project-grid">', '<div class="grid two project-grid">\n' + jobshift_card)

with open("projects.html", "w") as f:
    f.write(content)

print("Jobshift added")
